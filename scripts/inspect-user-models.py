import bpy, json, math
from pathlib import Path
from mathutils import Vector

root=Path(__file__).resolve().parents[1]
items=json.loads((root/'.local/refactor/models.json').read_text('utf8'))
out=root/'.local/refactor/model-previews'
out.mkdir(parents=True,exist_ok=True)
for item in items:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=item['file'])
    meshes=[o for o in bpy.context.scene.objects if o.type=='MESH']
    pts=[o.matrix_world@Vector(v) for o in meshes for v in o.bound_box]
    lo=Vector([min(p[i] for p in pts) for i in range(3)])
    hi=Vector([max(p[i] for p in pts) for i in range(3)])
    center=(lo+hi)/2; span=max(hi-lo)
    bpy.ops.object.empty_add()
    group=bpy.context.object
    for o in list(bpy.context.scene.objects):
        if o!=group and o.parent is None:
            o.parent=group
    group.location=-center/span;group.scale=(1/span,)*3
    scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=12
    scene.render.resolution_x=480;scene.render.resolution_y=320;scene.render.resolution_percentage=100
    scene.world=bpy.data.worlds.new('Space');scene.world.use_nodes=True
    scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.09,.13,.22,1)
    scene.world.node_tree.nodes['Background'].inputs[1].default_value=.5
    for location,power,size,color in [((0,-2,3),180,3,(.7,.85,1)),((1,2,1),110,2,(.6,.4,1))]:
        bpy.ops.object.light_add(type='AREA',location=location);o=bpy.context.object;o.data.energy=power;o.data.shape='DISK';o.data.size=size;o.data.color=color;o.rotation_euler=(-o.location).to_track_quat('-Z','Y').to_euler()
    bpy.ops.object.camera_add(location=(.45,-1.6,1.0));camera=bpy.context.object;camera.rotation_euler=(-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.type='ORTHO';camera.data.ortho_scale=1.42;scene.camera=camera
    scene.render.filepath=str(out/f"model-{item['index']:02}.png")
    bpy.ops.render.render(write_still=True)
    print('MODEL_DONE',item['index'],flush=True)
