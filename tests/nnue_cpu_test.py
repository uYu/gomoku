import sys
import unittest
from pathlib import Path
try:
    import torch
except ImportError:
    torch=None
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
@unittest.skipIf(torch is None,'PyTorch not installed')
class NearestCodeTests(unittest.TestCase):
    def test_tiled_assignment_matches_direct_pairwise_distance(self):
        from nnue_cpu import nearest_l2
        torch.manual_seed(20261029);torch.set_num_threads(2)
        x=torch.randn(47,64);y=torch.randn(123,64)
        expected=torch.cdist(x,y).argmin(1)
        self.assertTrue(torch.equal(nearest_l2(x,y,7,13),expected))
    def test_equal_distance_uses_first_code_and_no_gradient_graph(self):
        from nnue_cpu import nearest_l2,L2Distances
        x=torch.tensor([[1.,1.]],requires_grad=True);y=torch.tensor([[0.,0.],[2.,2.],[0.,0.]])
        self.assertEqual(nearest_l2(x,y,1,1).tolist(),[0])
        self.assertEqual((-L2Distances(x,y)).argmax(1).tolist(),[[0]])

class PackedCodebookTests(unittest.TestCase):
    def test_signed_ten_bit_stream_matches_integer_reference(self):
        import numpy as np
        from nnue_export import pack_signed10
        values=np.array([-512,-1,0,1,511,257,-257,123]*16,dtype=np.int16)
        encoded=sum((int(value)&1023)<<(10*i) for i,value in enumerate(values))
        expected=encoded.to_bytes(len(values)*10//8,'little')
        self.assertEqual(pack_signed10(values),expected)

if __name__=='__main__':unittest.main()
