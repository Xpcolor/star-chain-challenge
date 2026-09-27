"""Import user GLBs and bake six closed fracture chunks without altering sources."""
import bpy,bmesh,json,hashlib,sys
from pathlib import Path
from mathutils import Vector
root=Path(__file__).resolve().parents[1]
source_dir=Path(sys.argv[sys.argv.index('--')+1]) if '--' in sys.argv else Path.home()/'Desktop'/'飞船图'
source_manifest=json.loads((root/'dist/assets/fleet-models.json').read_text('utf8'))
mapping=[('player' if entry['id']=='aurora' else entry['id'].removeprefix('fleet-'),entry) for entry in source_manifest]
manifest=[]
for ident,entry in mapping:
 bpy.ops.wm.read_factory_settings(use_empty=True)
 source=source_dir/entry['source']
 if hashlib.sha256(source.read_bytes()).hexdigest()!=entry['sourceSha256']:raise ValueError(f'Source hash changed: {source.name}')
 bpy.ops.import_scene.gltf(filepath=str(source))
 meshes=[o for o in bpy.context.scene.objects if o.type=='MESH']
 bpy.ops.object.select_all(action='DESELECT')
 for o in meshes:o.select_set(True)
 bpy.context.view_layer.objects.active=meshes[0];bpy.ops.object.join();hull=bpy.context.object;hull.name='hull'
 bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
 points=[Vector(v) for v in hull.bound_box];lo=Vector([min(v[i] for v in points) for i in range(3)]);hi=Vector([max(v[i] for v in points) for i in range(3)])
 center=(lo+hi)/2;span=max(hi-lo)
 for v in hull.data.vertices:v.co=(v.co-center)/span
 lo=(lo-center)/span;hi=(hi-center)/span
 interior=bpy.data.materials.new('fracture_inner_alloy');interior.diffuse_color=(.09,.055,.03,1);interior.use_nodes=True
 shader=interior.node_tree.nodes.get('Principled BSDF');shader.inputs['Base Color'].default_value=(.11,.065,.03,1);shader.inputs['Metallic'].default_value=.65;shader.inputs['Roughness'].default_value=.72
 hull.data.materials.append(interior);cap_index=len(hull.data.materials)-1
 for ix in range(3):
  for iz in range(2):
   bm=bmesh.new();bm.from_mesh(hull.data)
   bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.000001)
   cuts=[(0,lo.x+(hi.x-lo.x)*ix/3,False),(0,lo.x+(hi.x-lo.x)*(ix+1)/3,True),(2,lo.z+(hi.z-lo.z)*iz/2,False),(2,lo.z+(hi.z-lo.z)*(iz+1)/2,True)]
   for axis,pos,outer in cuts:
    co=Vector((0,0,0));co[axis]=pos;normal=Vector((0,0,0));normal[axis]=1
    result=bmesh.ops.bisect_plane(bm,geom=list(bm.verts)+list(bm.edges)+list(bm.faces),dist=.00001,plane_co=co,plane_no=normal,clear_outer=outer,clear_inner=not outer)
    edges=[e for e in result['geom_cut'] if isinstance(e,bmesh.types.BMEdge) and e.is_boundary]
    if edges:
     result=bmesh.ops.holes_fill(bm,edges=edges,sides=0)
     for face in result.get('faces',[]):face.material_index=cap_index
   if bm.faces:
    data=bpy.data.meshes.new(f'debris_{ix}_{iz}');bm.to_mesh(data)
    for mat in hull.data.materials:data.materials.append(mat)
    part=bpy.data.objects.new(data.name,data);bpy.context.collection.objects.link(part)
   bm.free()
 # Do not export camera/lights or hidden user data. All fragments share hull textures.
 path=root/'dist/assets'/f'detailed-{ident}.glb'
 bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',export_yup=True,export_cameras=False,export_lights=False)
 manifest.append({'id':'aurora' if ident=='player' else 'fleet-'+ident,'version':1,'model':'/assets/'+path.name,'source':source.name,'sourceSha256':entry['sourceSha256'],'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'bytes':path.stat().st_size,'fractureParts':6})
 print('FLEET_PREPARED',ident,flush=True)
(root/'dist/assets/fleet-models.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),'utf8')
(root/'资产库/3D模型接入.json').write_text(json.dumps({'schemaVersion':2,'models':manifest},ensure_ascii=False,indent=2),'utf8')
