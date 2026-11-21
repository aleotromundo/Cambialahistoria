from __future__ import annotations

from typing import Any

import numpy as np
import pytest
import torch

from lost_storm_rl.export import MAGIC, check_fits, fixture_sample, header_for, pack, sparse, unpack, unpacked_policy
from lost_storm_rl.model import Policy

LAYOUT = {"self": 6, "slot": 3, "slots": 2, "entity": 4, "entities": 3, "rays": 2, "size": 6 + 3 * 2 + 4 * 3 + 2, "mask": 4 + 3 + 2 + 2}
CONTRACT: dict[str, Any] = {"version": 9, "fingerprint": "feedbeef", "layout": LAYOUT, "heads": [4, 3, 2, 2]}
WIDTH = 8


def checkpoint() -> dict[str, Any]:
    torch.manual_seed(7)
    policy = Policy(CONTRACT, width=WIDTH)
    return {"contract": policy.contract, "width": WIDTH, "state": policy.state_dict(), "extra": {"update": 40, "best": {"model_won": 0.5}}}


def test_the_file_round_trips_every_tensor_but_the_value_head_within_half_precision() -> None:
    saved = checkpoint()
    unpacked = unpack(pack(saved))
    kept = [name for name in saved["state"] if not name.startswith("value.")]
    assert list(unpacked.state) == kept
    for name in kept:
        assert torch.allclose(unpacked.state[name], saved["state"][name], rtol=1e-3, atol=1e-3), name


def test_the_header_names_each_tensor_in_order_with_its_shape_and_the_model_it_came_from() -> None:
    saved = checkpoint()
    header = header_for(saved)
    assert header["contract"] == {key: CONTRACT[key] for key in ("version", "fingerprint", "layout", "heads")}
    assert header["width"] == WIDTH and header["layers"] == 2 and header["attentionHeads"] == 4 and header["dtype"] == "float16"
    assert [entry["name"] for entry in header["tensors"]] == [name for name in saved["state"] if not name.startswith("value.")]
    assert all(entry["shape"] == list(saved["state"][entry["name"]].shape) for entry in header["tensors"])
    assert header["source"] == {"update": 40, "best": {"model_won": 0.5}}


def test_the_data_takes_two_bytes_a_number() -> None:
    saved = checkpoint()
    blob = pack(saved)
    numbers = sum(tensor.numel() for name, tensor in saved["state"].items() if not name.startswith("value."))
    assert numbers * 2 < len(blob) < numbers * 2 + 4096
    assert blob[:4] == MAGIC


def test_a_file_with_the_wrong_magic_or_trailing_bytes_is_refused() -> None:
    blob = pack(checkpoint())
    with pytest.raises(ValueError):
        unpack(b"XXXX" + blob[4:])
    with pytest.raises(ValueError):
        unpack(blob + b"\0\0")


def test_a_checkpoint_for_another_contract_is_refused() -> None:
    with pytest.raises(ValueError):
        check_fits(checkpoint(), {**CONTRACT, "fingerprint": "00000000"})
    check_fits(checkpoint(), CONTRACT)


def test_the_policy_built_from_the_file_takes_every_tensor_the_file_holds() -> None:
    saved = checkpoint()
    unpacked = unpack(pack(saved))
    policy = unpacked_policy(unpacked, CONTRACT)
    state = policy.state_dict()
    for name, tensor in unpacked.state.items():
        assert torch.equal(state[name], tensor), name


def test_a_fixture_sample_keeps_only_non_zero_inputs_and_the_logits_of_allowed_choices() -> None:
    policy = unpacked_policy(unpack(pack(checkpoint())), CONTRACT)
    obs = np.zeros(LAYOUT["size"], dtype=np.float32)
    obs[0] = 1.0
    obs[6] = 1.0
    obs[9] = 0.25
    mask = np.array([1, 0, 1, 1, 1, 1, 0, 1, 0, 1, 0], dtype=np.uint8)
    sample = fixture_sample(policy, obs, mask)
    assert sample["obs"] == sparse(obs) == [[0, 1.0], [6, 1.0], [9, 0.25]]
    assert sample["mask"] == mask.tolist()
    assert [value is None for value in sample["logits"]["move"]] == [False, True, False, False]
    assert [value is None for value in sample["logits"]["skill"]] == [False, False, True]
    assert [value is None for value in sample["logits"]["target"]] == [False, True]
    assert [value is None for value in sample["logits"]["use"]] == [False, True]
    moves = sample["logits"]["move"]
    assert sample["action"][0] == max((index for index, value in enumerate(moves) if value is not None), key=lambda index: moves[index])
