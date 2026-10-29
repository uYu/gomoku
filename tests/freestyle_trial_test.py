import importlib.util
import unittest
from pathlib import Path
import numpy as np

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('trial',ROOT/'scripts/prepare-freestyle-trial.py')
trial=importlib.util.module_from_spec(spec);spec.loader.exec_module(trial)

class FreestyleTrialTests(unittest.TestCase):
    def test_freestyle_overline_is_win_and_later_moves_are_rejected(self):
        moves=[105,0,106,2,107,4,109,6,110,8,108]
        self.assertEqual(trial.geometric_winner(moves),1)
        with self.assertRaisesRegex(ValueError,'moves_after_win'):trial.geometric_winner(moves+[10])
        with self.assertRaisesRegex(ValueError,'duplicate_square'):trial.geometric_winner([112,112])

    def test_psq_rules_and_coordinates(self):
        text='Piskvorky 15x15, 11:11, 0\n1,15,0\n15,1,10\na\nb\n-1\n1,Freestyle15_1\n'
        self.assertEqual(trial.parse_psq(text)[0],[210,14])
        with self.assertRaisesRegex(ValueError,'invalid_tail'):trial.parse_psq(text.replace('Freestyle15_1','Standard1'))
        with self.assertRaisesRegex(ValueError,'coordinate'):trial.parse_psq(text.replace('1,15,0','0,15,0'))

    def test_trial_has_no_d4_position_or_opening_family_leakage(self):
        root=ROOT/'.build/training/freestyle-trial-v1'
        if not (root/'manifest.json').exists():self.skipTest('Prepare trial first')
        previous=set();families=set()
        for split in ('train','validation','test'):
            with np.load(root/f'{split}-mixed.npz',allow_pickle=False) as data:
                own={trial.position_key(board) for board in data['board']}
                self.assertEqual(len(own),len(data['board']))
                self.assertFalse(previous&own)
                own_families=set(data['family'].tolist())
                self.assertFalse(families&own_families)
                mask=np.unpackbits(data['legal'],axis=1,count=225,bitorder='little')
                self.assertTrue(mask[np.arange(len(mask)),data['policy']].all())
                self.assertTrue((mask==(data['board'].sum(axis=1).reshape(-1,225)==0)).all())
                self.assertTrue(np.isin(data['value'],[0,1,2]).all())
                previous|=own;families|=own_families

if __name__=='__main__':unittest.main()
