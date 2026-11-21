from __future__ import annotations

import json
import struct
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import numpy as np
import torch

from .bridge import ArenaEnvs
from .model import Policy

MAGIC = b"LSPL"
FORMAT = 1
DTYPE = "float16"
ATTENTION_HEADS = 4
LEFT_OUT = ("value.",)
LENGTH = struct.Struct("<I")
FIXTURE_SEED = 3003000000
FIXTURE_DUELS = 2
FIXTURE_EVERY = 25
FIXTURE_TAKEN = 4
FIXTURE_DIGITS = 6
HEAD_NAMES = ("move", "skill", "target", "use")


@dataclass(frozen=True)
class Unpacked:
    header: dict[str, Any]
    state: dict[str, torch.Tensor]


def kept_names(state: dict[str, torch.Tensor]) -> list[str]:
    return [name for name in state if not name.startswith(LEFT_OUT)]


def layer_count(state: dict[str, torch.Tensor]) -> int:
    return len({name.split(".")[2] for name in state if name.startswith("mixer.layers.")})


def header_for(saved: dict[str, Any]) -> dict[str, Any]:
    state: dict[str, torch.Tensor] = saved["state"]
    contract = saved["contract"]
    extra = saved.get("extra", {})
    return {
        "format": FORMAT,
        "contract": {key: contract[key] for key in ("version", "fingerprint", "layout", "heads")},
        "width": int(saved["width"]),
        "layers": layer_count(state),
        "attentionHeads": ATTENTION_HEADS,
        "dtype": DTYPE,
        "tensors": [{"name": name, "shape": list(state[name].shape)} for name in kept_names(state)],
        "source": {"update": extra.get("update"), "best": extra.get("best")},
    }


def pack(saved: dict[str, Any]) -> bytes:
    header = header_for(saved)
    text = json.dumps(header, separators=(",", ":")).encode("utf-8")
    start = MAGIC + LENGTH.pack(len(text)) + text
    padding = b"\0" * (len(start) % 2)
    data = b"".join(saved["state"][entry["name"]].detach().cpu().to(torch.float16).contiguous().numpy().tobytes() for entry in header["tensors"])
    return start + padding + data


def unpack(blob: bytes) -> Unpacked:
    if blob[: len(MAGIC)] != MAGIC:
        raise ValueError("not a Lost Storm policy file: wrong magic")
    (length,) = LENGTH.unpack_from(blob, len(MAGIC))
    at = len(MAGIC) + LENGTH.size
    header = json.loads(blob[at : at + length].decode("utf-8"))
    if header.get("format") != FORMAT or header.get("dtype") != DTYPE:
        raise ValueError(f"policy file format {header.get('format')} / {header.get('dtype')} is not {FORMAT} / {DTYPE}")
    at += length
    at += at % 2
    state: dict[str, torch.Tensor] = {}
    for entry in header["tensors"]:
        shape = tuple(int(size) for size in entry["shape"])
        count = int(np.prod(shape)) if shape else 1
        values = np.frombuffer(blob, dtype=np.float16, count=count, offset=at)
        state[entry["name"]] = torch.from_numpy(values.astype(np.float32)).reshape(shape)
        at += count * 2
    if at != len(blob):
        raise ValueError(f"policy file holds {len(blob) - at} bytes past its last tensor")
    return Unpacked(header, state)


def check_fits(saved: dict[str, Any], contract: dict[str, Any]) -> None:
    if saved["contract"]["fingerprint"] != contract["fingerprint"]:
        raise ValueError(f"checkpoint speaks contract v{saved['contract']['version']} ({saved['contract']['fingerprint']}), the game speaks v{contract['version']} ({contract['fingerprint']}); widen it first")


def unpacked_policy(unpacked: Unpacked, contract: dict[str, Any]) -> Policy:
    policy = Policy(contract, width=int(unpacked.header["width"]), layers=int(unpacked.header["layers"]), attention_heads=int(unpacked.header["attentionHeads"]))
    fresh = policy.state_dict()
    for name, tensor in unpacked.state.items():
        fresh[name] = tensor
    policy.load_state_dict(fresh)
    return policy


def sparse(row: np.ndarray) -> list[list[float]]:
    return [[int(index), round(float(row[index]), FIXTURE_DIGITS)] for index in np.flatnonzero(row)]


def rounded(row: np.ndarray) -> np.ndarray:
    out = np.zeros_like(row)
    for index, value in sparse(row):
        out[int(index)] = value
    return out


def fixture_sample(policy: Policy, obs: np.ndarray, mask: np.ndarray) -> dict[str, Any]:
    with torch.no_grad():
        logits, _ = policy.logits(torch.from_numpy(obs[None, :]), torch.from_numpy(mask[None, :]))
    heads: dict[str, list[float | None]] = {}
    for name, logit in zip(HEAD_NAMES, logits):
        row = logit[0].tolist()
        allowed = row_mask(mask, policy.shape.heads, HEAD_NAMES.index(name))
        heads[name] = [float(value) if keep else None for value, keep in zip(row, allowed)]
    action = [int(logit[0].argmax().item()) for logit in logits]
    return {"obs": sparse(obs), "mask": [int(bit) for bit in mask.tolist()], "logits": heads, "action": action}


def row_mask(mask: np.ndarray, heads: tuple[int, ...], head: int) -> list[bool]:
    at = sum(heads[:head])
    return [bool(bit > 0) for bit in mask[at : at + heads[head]]]


def duel_observations(policy: Policy, duels: int, seed: int, every: int, taken: int) -> tuple[np.ndarray, np.ndarray]:
    envs = ArenaEnvs(1, duels * 2, seed, 0.0, 1, duels=duels)
    kept_obs: list[np.ndarray] = []
    kept_mask: list[np.ndarray] = []
    try:
        batch = envs.reset()
        for step in range(every * taken):
            if step % every == 0:
                kept_obs.extend(rounded(row) for row in batch.obs)
                kept_mask.extend(batch.mask)
            with torch.no_grad():
                actions, _, _ = policy.act(torch.from_numpy(batch.obs), torch.from_numpy(batch.mask), greedy=True)
            batch = envs.step(actions.numpy().astype(np.int32))
    finally:
        envs.close()
    return np.stack(kept_obs).astype(np.float32), np.stack(kept_mask).astype(np.uint8)


def agreement(first: Policy, second: Policy, obs: np.ndarray, mask: np.ndarray) -> float:
    with torch.no_grad():
        ours, _, _ = first.act(torch.from_numpy(obs), torch.from_numpy(mask), greedy=True)
        theirs, _, _ = second.act(torch.from_numpy(obs), torch.from_numpy(mask), greedy=True)
    return float((ours == theirs).all(dim=1).float().mean().item())


def write_fixture(policy: Policy, obs: np.ndarray, mask: np.ndarray, header: dict[str, Any]) -> dict[str, Any]:
    return {"fingerprint": header["contract"]["fingerprint"], "source": header["source"], "samples": [fixture_sample(policy, obs[index], mask[index]) for index in range(obs.shape[0])]}


def export(policy_path: str, out: str, fixture: str | None) -> dict[str, Any]:
    saved = torch.load(policy_path, map_location="cpu", weights_only=True)
    probe = ArenaEnvs(1, 1, 1, 0.0, 1)
    contract = probe.contract
    probe.close()
    check_fits(saved, contract)
    blob = pack(saved)
    Path(out).parent.mkdir(parents=True, exist_ok=True)
    Path(out).write_bytes(blob)
    unpacked = unpack(blob)
    report: dict[str, Any] = {"out": out, "bytes": len(blob), "tensors": len(unpacked.header["tensors"]), "source": unpacked.header["source"]}
    if fixture is None:
        return report
    original = Policy(contract, width=int(saved["width"]))
    original.load_state_dict(saved["state"])
    halved = unpacked_policy(unpacked, contract)
    obs, mask = duel_observations(original, FIXTURE_DUELS, FIXTURE_SEED, FIXTURE_EVERY, FIXTURE_TAKEN)
    Path(fixture).write_text(json.dumps(write_fixture(halved, obs, mask, unpacked.header), separators=(",", ":")) + "\n", encoding="utf-8")
    return {**report, "fixture": fixture, "samples": int(obs.shape[0]), "same_greedy_action": agreement(original, halved, obs, mask)}
