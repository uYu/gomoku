import ctypes
import importlib.util
import json
import unittest
import xml.etree.ElementTree as ET
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('clean',ROOT/'scripts/prepare-renjunet.py')
clean=importlib.util.module_from_spec(spec);spec.loader.exec_module(clean)
class RenjuNetTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        try:cls.native=clean.NativeDataset()
        except OSError:raise unittest.SkipTest('Build native dataset library first')
    def game(self,moves,result='1'):
        element=ET.Element('game',{'id':'test','rule':'1','bresult':result})
        ET.SubElement(element,'move').text=' '.join(chr(97+p%15)+str(15-p//15) for p in moves)
        return element
    def test_coordinates_and_invalid_tokens(self):
        self.assertEqual(clean.parse_moves('h8 a15 o1'),[112,0,224])
        for text in ['p1','a0','a16','hh','h8 junk']:
            with self.assertRaises(ValueError):clean.parse_moves(text)
    def test_native_terminal_validation_and_result_conflict(self):
        moves=[108,0,109,2,110,4,111,6,112]
        self.assertEqual(self.native.validate(moves),(0,-1,1))
        rules={'1':{'category':'1'}}
        self.assertEqual(clean.clean_game(self.game(moves),rules,self.native,9)[1],1)
        with self.assertRaisesRegex(ValueError,'result_conflicts'):
            clean.clean_game(self.game(moves,'0'),rules,self.native,9)
        self.assertEqual(self.native.validate(moves+[224])[0],2)
    def test_terminal_foul_is_removed_and_never_becomes_a_policy_target(self):
        moves=[111,0,113,2,97,4,127,6,112]
        rules={'1':{'category':'1'}}
        accepted=clean.clean_game(self.game(moves,'0'),rules,self.native,8)
        self.assertEqual(accepted[0],moves[:-1]);self.assertEqual(accepted[1],2)
        self.assertEqual(accepted[2],'terminal_black_foul_removed')
        with self.assertRaisesRegex(ValueError,'black_forbidden_move'):
            clean.clean_game(self.game(moves,'1'),rules,self.native,8)
        with self.assertRaisesRegex(ValueError,'black_forbidden_move'):
            clean.clean_game(self.game(moves+[8],'0'),rules,self.native,8)
    def test_legality_mask_distinguishes_black_and_white(self):
        prefix=[111,0,113,2,97,4,127,6]
        self.assertEqual(self.native.legal_mask(prefix)[112],0)
        self.assertEqual(self.native.legal_mask(prefix+[224])[112],1)
        self.assertEqual(self.native.legal_mask(prefix)[111],0)
    def test_game_and_colored_position_keys_are_symmetry_invariant(self):
        moves=[112,98,113,97,128,96,110,126]
        def transform(point,s):
            r,c=divmod(point,15)
            if s>=4:c=14-c
            for _ in range(s%4):r,c=c,14-r
            return r*15+c
        expected=self.native.identity(moves)
        for s in range(8):self.assertEqual(self.native.identity([transform(m,s) for m in moves]),expected)
        # Equivalent colored opening positions stay together even if same-color moves reorder.
        reordered=[moves[2],moves[3],moves[0],moves[1],*moves[4:]]
        self.assertEqual(self.native.identity(reordered)[1],expected[1])
    def test_processed_game_and_family_splits_are_disjoint(self):
        root=ROOT/'.build/training/renjunet'
        if not (root/'manifest.json').exists():self.skipTest('No processed data')
        families=set();games=set()
        for split in ['train','validation','test']:
            split_families=set();split_games=set()
            with (root/(split+'.jsonl')).open() as stream:
                for line in stream:
                    record=json.loads(line);split_families.add(record['family']);split_games.add(record['game_key'])
            self.assertFalse(families & split_families);self.assertFalse(games & split_games)
            families|=split_families;games|=split_games
        self.assertEqual(len(games),107764)
if __name__=='__main__':unittest.main()
