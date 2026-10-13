"""Read-only upstream Zarr 3.4.1 inspection and selection; no codec implementation."""
from __future__ import annotations
import base64, importlib.metadata, itertools, math, sys
from pathlib import Path
from files import require, relative, value_digest, encoded

ENGINE_VERSION="3.4.1"
ENGINE_COMMIT="246fa20c397af5e8bfaa2958100a09fea329193e"
def engine():
    try:
        import zarr, numpy as np
    except ImportError as e:
        require(False,"ZARR_RUNTIME_MISSING","Install the original zarr==3.4.1 and its declared dependencies in the selected Python environment")
    require(zarr.__version__==ENGINE_VERSION,"ZARR_RUNTIME_VERSION","This reviewed operator requires original zarr==3.4.1")
    return zarr,np
def runtime():
    zarr,np=engine()
    names=("zarr","numpy","numcodecs","google-crc32c","packaging","typing_extensions","donfig","msgspec")
    return {"provider":"zarr-python","version":zarr.__version__,"sourceCommit":ENGINE_COMMIT,
            "python":sys.version.split()[0],"packages":{n:importlib.metadata.version(n) for n in names}}
def safe_value(value):
    """JSON-safe display metadata, retaining special values rather than changing them."""
    if value is None or isinstance(value,(str,bool)):return value
    if isinstance(value,int):return value if abs(value)<=9007199254740991 else {"kind":"integer","value":str(value)}
    if type(value).__module__.startswith("numpy") and getattr(getattr(value,"dtype",None),"kind",None) in ("M","m"):
        return cell(value,value.dtype)
    if isinstance(value,float):
        if math.isnan(value):return {"kind":"float","value":"NaN"}
        if math.isinf(value):return {"kind":"float","value":"Infinity" if value>0 else "-Infinity"}
        if value==0 and math.copysign(1,value)<0:return {"kind":"float","value":"-0"}
        return value
    if isinstance(value,bytes):return {"kind":"bytes","base64":base64.b64encode(value).decode()}
    if isinstance(value,complex):return {"kind":"complex","real":safe_value(value.real),"imaginary":safe_value(value.imag)}
    if isinstance(value,dict):return {str(k):safe_value(v) for k,v in value.items()}
    if isinstance(value,(list,tuple)):return [safe_value(v) for v in value]
    if hasattr(value,"tolist"):return safe_value(value.tolist())
    if hasattr(value,"item"):return safe_value(value.item())
    if hasattr(value,"to_dict"):return safe_value(value.to_dict())
    raise TypeError("Unsupported native metadata value: "+type(value).__name__)
def open_node(root,path=""):
    zarr,np=engine();relative(path,allow_root=True)
    store=zarr.storage.LocalStore(Path(root),read_only=True)
    return zarr.open(store=store,mode="r",path=path or None,use_consolidated=False)
def describe_node(node,path):
    zarr,np=engine()
    result={"path":path,"nodeType":"array" if isinstance(node,zarr.Array) else "group",
            "metadata":safe_value(node.metadata.to_dict()),"attributes":safe_value(dict(node.attrs))}
    if isinstance(node,zarr.Array):
        dtype=np.dtype(node.dtype)
        result.update(shape=list(node.shape),ndim=node.ndim,dtype=dtype.str,dtypeDescription=safe_value(dtype.descr),
                      chunks=safe_value(node.chunks),size=math.prod(node.shape),
                      dimensionNames=safe_value(getattr(node.metadata,"dimension_names",None)))
    result["metadataSha256"]=value_digest(result)
    return result
def inspect_store(root,max_nodes=10000):
    zarr,np=engine();nodes=[];pending=[""];visited=set()
    while pending:
        path=pending.pop()
        require(path not in visited and len(visited)<max_nodes,"ZARR_NODE_LIMIT","The source hierarchy exceeds the node limit")
        require(path.count("/")<64,"ZARR_NODE_LIMIT","The source hierarchy is too deep")
        visited.add(path);node=open_node(root,path);nodes.append(describe_node(node,path))
        if isinstance(node,zarr.Group):
            # Reopen each native child without consolidated metadata: do not trust stale hints.
            for name,_ in sorted(node.members(max_depth=0),key=lambda x:x[0],reverse=True):
                relative(name);pending.append(path+"/"+name if path else name)
    nodes.sort(key=lambda x:x["path"])
    return {"schema":"stellar-forge.zarr-native-inspection.v1","engine":runtime(),"nodes":nodes,
            "arrays":sum(x["nodeType"]=="array" for x in nodes),"groups":sum(x["nodeType"]=="group" for x in nodes),
            "metadataSha256":value_digest(nodes),"readOnly":True,"consolidatedMetadata":"ignored in favour of native per-node metadata"}
def normalize_selection(shape,axes):
    require(isinstance(axes,list) and len(axes)==len(shape),"ZARR_SELECTION","Specify exactly one index or slice per source axis")
    selections=[];positions=[]
    for axis,(length,value) in enumerate(zip(shape,axes)):
        if type(value) is int:
            require(0<=value<length,"ZARR_SELECTION","Index outside source axis "+str(axis));selections.append(value);positions.append([value]);continue
        require(isinstance(value,dict) and set(value)<=set(("start","stop","step")),"ZARR_SELECTION","Use an integer index or a start/stop/step slice")
        start=value.get("start",0);stop=value.get("stop",length);step=value.get("step",1)
        require(all(type(v) is int for v in (start,stop,step)) and 0<=start<=stop<=length and step>0,
                "ZARR_SELECTION","Use bounded non-negative slices with a positive step")
        selections.append(slice(start,stop,step));positions.append(range(start,stop,step))
    return tuple(selections),positions
def cell(value,dtype):
    """Lossless scalar transport; large integers/floats are explicit native text."""
    zarr,np=engine();kind=dtype.kind
    if dtype.fields:
        return {"kind":"record","fields":{name:cell(value[name],dtype.fields[name][0]) for name in dtype.names}}
    if dtype.subdtype:
        base,shape=dtype.subdtype
        return {"kind":"subarray","shape":list(shape),"values":[cell(x,base) for x in np.asarray(value).flat]}
    if kind=="b":return {"kind":"boolean","value":bool(value)}
    if kind in "iu":return {"kind":"integer","value":str(value)}
    if kind=="f":
        f=float(value)
        require(dtype.itemsize<=8,"ZARR_DTYPE_PROJECTION","Long-double values need an explicit external projection")
        text="NaN" if math.isnan(f) else ("Infinity" if f>0 else "-Infinity") if math.isinf(f) else repr(f)
        return {"kind":"float","value":text}
    if kind=="c":
        require(dtype.itemsize<=16,"ZARR_DTYPE_PROJECTION","Extended complex values require an explicit external projection")
        return {"kind":"complex","real":cell(np.real(value),np.dtype("f4" if dtype.itemsize==8 else "f8")),
                "imaginary":cell(np.imag(value),np.dtype("f4" if dtype.itemsize==8 else "f8"))}
    if kind in "SU":
        if kind=="S":return {"kind":"bytes","base64":base64.b64encode(bytes(value)).decode()}
        return {"kind":"text","value":str(value)}
    if kind in "Mm":
        return {"kind":"datetime" if kind=="M" else "timedelta","dtype":dtype.str,
                "ticks":str(value.view("i8")),"display":str(value)}
    if kind=="V":return {"kind":"bytes","base64":base64.b64encode(bytes(value)).decode()}
    if kind in ("O","T"):
        require(isinstance(value,(str,bytes)),"ZARR_DTYPE_PROJECTION","Arbitrary object values are never pickled or published")
        return {"kind":"text","value":value} if isinstance(value,str) else {"kind":"bytes","base64":base64.b64encode(value).decode()}
    require(False,"ZARR_DTYPE_PROJECTION","Unsupported native dtype for explicit scalar transport: "+dtype.str)
def extract(root,plan,max_cells=250000,max_native_bytes=64*1024*1024):
    zarr,np=engine();node=open_node(root,plan["array"])
    require(isinstance(node,zarr.Array),"ZARR_SELECTION","Choose an original array")
    metadata=describe_node(node,plan["array"])
    require(metadata["metadataSha256"]==plan["metadataSha256"],"ZARR_SELECTION_CHANGED","Selected array metadata changed",409)
    selection,positions=normalize_selection(node.shape,plan["axes"])
    count=math.prod(len(p) for p in positions)
    require(count<=max_cells and count*max(np.dtype(node.dtype).itemsize,8)<=max_native_bytes,
            "ZARR_RESULT_LIMIT","The selected array result exceeds the explicit cell or memory limit")
    values=np.asarray(node.get_basic_selection(selection))
    require(values.size==count,"ZARR_NATIVE_RESULT_SHAPE","Native returned shape differs from the selected cells")
    rows=[]
    for ordinal,(index,value) in enumerate(zip(itertools.product(*positions),values.flat)):
        rows.append({"ordinal":ordinal,"sourceIndex":list(index),"value":cell(value,values.dtype)})
    return {"schema":"stellar-forge.zarr-native-result.v1","engine":runtime(),"array":plan["array"],
            "arrayMetadataSha256":metadata["metadataSha256"],"selection":plan["axes"],
            "sourceShape":list(node.shape),"shape":list(values.shape),"dtype":values.dtype.str,
            "dtypeDescription":safe_value(values.dtype.descr),"rowCount":len(rows),"order":"C",
            "metadata":metadata,"rows":rows,"readOnly":True}
