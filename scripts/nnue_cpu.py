"""CPU nearest-code lookup for official VQ training; uses tiled BLAS, bounded RAM.

The default deterministic L2 nearest-code assignment is unchanged. Distances
are not differentiated by the upstream straight-through VQ loss. Stochastic
sampling and entropy regularization must remain disabled with this backend.
"""
import torch

@torch.no_grad()
def nearest_l2(query, codebook, query_chunk=512, code_chunk=4096):
    query, codebook = query.detach(),codebook.detach()
    code_norm = codebook.square().sum(1)
    result = torch.empty(len(query),dtype=torch.long,device=query.device)
    for start in range(0,len(query),query_chunk):
        x = query[start:start+query_chunk]
        x_norm = x.square().sum(1,keepdim=True)
        best = torch.full((len(x),),float('inf'),device=x.device)
        index = torch.zeros(len(x),dtype=torch.long,device=x.device)
        for offset in range(0,len(codebook),code_chunk):
            y = codebook[offset:offset+code_chunk]
            distance = x_norm + code_norm[offset:offset+len(y)][None,:] - 2*(x@y.T)
            value,local = distance.min(1)
            changed = value < best
            index = torch.where(changed,local+offset,index)
            best = torch.minimum(best,value)
        result[start:start+len(x)] = index
    return result

class L2Distances:
    def __init__(self,x,y,negated=False): self.x,self.y,self.negated=x,y,negated
    def __neg__(self): return L2Distances(self.x,self.y,not self.negated)
    def argmin(self,dim):
        if dim!=1 or self.negated: raise ValueError('Only deterministic L2 nearest assignment is supported')
        return nearest_l2(self.x,self.y)[:,None]
    def argmax(self,dim): return (-self).argmin(dim)

def install():
    import model.vq as vq
    vq.l2_dist = lambda x,y:L2Distances(x,y)
