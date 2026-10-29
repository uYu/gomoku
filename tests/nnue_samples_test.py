import importlib.util
import json
import unittest
from pathlib import Path
import numpy as np
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('purge',ROOT/'scripts/purge-nnue-overlap.py')
purge=importlib.util.module_from_spec(spec);spec.loader.exec_module(purge)
class NNUESampleTests(unittest.TestCase):
    def test_validation_and_test_have_no_d4_position_overlap_with_earlier_splits(self):
        root=ROOT/'.build/training/nnue-samples-v2'
        if not (root/'manifest.json').exists():self.skipTest('Prepare samples first')
        for color in ['black','white']:
            previous=set();families=set()
            for split in ['train','validation','test']:
                with np.load(root/f'{split}-{color}.npz',allow_pickle=False) as data:
                    boards=data['board'];own_families=set(data['family'].tolist())
                    legal=np.unpackbits(data['legal'],axis=1,count=225,bitorder='little')
                    self.assertTrue(legal[np.arange(len(legal)),data['policy']].all())
                    self.assertTrue(np.isin(data['value'],[0,1,2]).all())
                    own={purge.position_key(board) for board in boards}
                self.assertFalse(previous & own);self.assertFalse(families & own_families)
                previous |= own;families |= own_families
if __name__=='__main__':unittest.main()
