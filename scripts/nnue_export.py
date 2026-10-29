"""Bit-identical vectorized Mix9svq serializer, reusing upstream quantizers.

Only the packed 10-bit stream implementation is changed for CPU throughput.
Header, model architecture, mapping generation and numerical quantizers are
provided by the pinned upstream trainer.
"""
import numpy as np

def pack_signed10(values):
    flat=np.asarray(values,dtype=np.int16).reshape(-1)
    if len(flat)%32:raise ValueError('Expected complete 320-bit blocks')
    if np.any(flat<-512) or np.any(flat>511):raise ValueError('Signed 10-bit range')
    items=flat.reshape(-1,32).astype(np.uint64)&np.uint64(1023)
    words=np.zeros((len(items),5),dtype='<u8')
    for i in range(32):
        word,shift=divmod(i*10,64)
        words[:,word]|=items[:,i]<<np.uint64(shift)
        if shift+10>64:words[:,word+1]|=items[:,i]>>np.uint64(64-shift)
    return words.tobytes()

def serialize(self,out,model,device):
    features1,index1=self._export_feature_codebook(model,device,1)
    features2,index2=self._export_feature_codebook(model,device,2)
    if features1.size!=65536*64 or features2.size!=65536*64:raise ValueError('Expected full-width 65536 x 64 codebooks')
    out.write(pack_signed10(features1));out.write(pack_signed10(features2))
    out.write(index1.astype('<u2').tobytes());out.write(index2.astype('<u2').tobytes())
    dw,bias=self._export_feature_dwconv(model)
    out.write(dw.astype('<i2').tobytes());out.write(bias.astype('<i2').tobytes())
    policy=self._export_policy_pwconv(model)
    for i,array in enumerate(policy[:4]):out.write(array.astype('<i1' if i%2==0 else '<i4').tobytes())
    for name in ['value_corner','value_edge','value_center','value_quad']:
        for i,array in enumerate(self._export_star_block(model,name)):out.write(array.astype('<i1' if i%2==0 else '<i4').tobytes())
    value=list(self._export_value(model))
    value[4]=np.concatenate([value[4],np.zeros_like(value[4][:1])],axis=0)
    value[5]=np.concatenate([value[5],np.zeros_like(value[5][:1])],axis=0)
    for i,array in enumerate(value):out.write(array.astype('<i1' if i%2==0 else '<i4').tobytes())
    out.write(policy[4].astype('<f4').tobytes());out.write(policy[5].astype('<f4').tobytes());out.write(bytes(44))

def install():
    from model.serialization.mixnet import Mix9svqNetSerializer
    Mix9svqNetSerializer.serialize=serialize
