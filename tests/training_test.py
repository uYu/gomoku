import importlib.util
import json
import unittest
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('prepare', ROOT / 'scripts/prepare-training.py')
prepare = importlib.util.module_from_spec(spec)
spec.loader.exec_module(prepare)

class TrainingDataTests(unittest.TestCase):
    def test_original_collection_validation_and_symmetry_deduplication(self):
        games = json.loads((ROOT / 'data/raw/winepy-games.json').read_text())
        valid = set()
        invalid = 0
        for game in games:
            try:
                moves, _ = prepare.validate(game)
                valid.add(prepare.identity(moves))
            except ValueError:
                invalid += 1
        self.assertEqual(len(games), 875)
        self.assertEqual(len(valid), 543)
        self.assertEqual(invalid, 4)

    def test_game_splits_do_not_leak_under_rotation_or_reflection(self):
        directory = ROOT / '.build/training'
        if not (directory / 'manifest.json').exists():
            self.skipTest('Run npm run training:prepare first')
        sets = []
        for name in ['train', 'validation', 'test']:
            games = json.loads((directory / (name + '-games.json')).read_text())
            sets.append({prepare.identity(game) for game in games})
        self.assertEqual([len(s) for s in sets], [434, 54, 55])
        self.assertFalse(sets[0] & sets[1] or sets[0] & sets[2] or sets[1] & sets[2])

    def test_renju_splits_and_wire_rule(self):
        import struct
        directory = ROOT / '.build/training/renju'
        if not (directory / 'manifest.json').exists():
            self.skipTest('Run npm run training:prepare first')
        report = json.loads((directory / 'manifest.json').read_text())
        self.assertEqual(report['rule'], 'renju')
        sets = []
        for name in ['train', 'validation', 'test']:
            games = json.loads((directory / (name + '-games.json')).read_text())
            sets.append({prepare.identity(game) for game in games})
            with (directory / (name + '.bin')).open('rb') as stream:
                while header := stream.read(4):
                    first, second = struct.unpack('<HH', header)
                    self.assertEqual(second & 7, 4)
                    self.assertEqual(len(stream.read(((first >> 2) & 511) * 2)), ((first >> 2) & 511) * 2)
        self.assertEqual([len(group) for group in sets], [271,34,34])
        self.assertFalse(sets[0] & sets[1] or sets[0] & sets[2] or sets[1] & sets[2])

    def test_training_result_is_a_real_policy_fine_tune(self):
        report = json.loads((ROOT / 'models/training-report.json').read_text())
        import hashlib
        self.assertEqual(hashlib.sha256((ROOT / 'models/rapfi/trained.bin').read_bytes()).hexdigest(), report['trained_sha256'])
        self.assertGreater(report['parameter_count'], 0)
        self.assertLess(report['test_quantized_policy_loss_after'], report['test_quantized_policy_loss_before'])
        self.assertNotEqual(report['trained_sha256'], report['parent_sha256'])

    def test_invalid_records_are_rejected(self):
        for record in [[112, -112], [225], [112, 113], [112, -113]]:
            with self.assertRaises(ValueError):
                prepare.validate(record)

if __name__ == '__main__':
    unittest.main()
