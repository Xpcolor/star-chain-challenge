"""Render matching transparent fallback sprites from the actual GLB fleet."""
import bpy,os,math
from mathutils import Vector
ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
for ident in ['player']+[f'{i:02}' for i in range(1,17)]:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=os.path.join(ROOT,'dist','assets',f'ship-{ident}.glb'))
    s=bpy.context.scene;s.render.engine='CYCLES';s.cycles.samples=16
    try:
        p=bpy.context.preferences.addons['cycles'].preferences;p.compute_device_type='OPTIX';p.get_devices()
        for d in p.devices:d.use=d.type!='CPU'
        s.cycles.device='GPU'
    except Exception:pass
    world=bpy.data.worlds.new('Space');s.world=world;world.use_nodes=True;world.node_tree.nodes['Background'].inputs[0].default_value=(.05,.09,.16,1);world.node_tree.nodes['Background'].inputs[1].default_value=.45
    for name,loc,power,color,size in [('Key',(-1,-4,7),850,(.7,.85,1),6),('Rim',(-2,4,3),1400,(.13,.5,1),4),('Fill',(4,-2,2),500,(1,.86,.72),5)]:
        d=bpy.data.lights.new(name,'AREA');d.energy=power;d.color=color;d.size=size;o=bpy.data.objects.new(name,d);s.collection.objects.link(o);o.location=loc;o.rotation_euler=(-o.location).to_track_quat('-Z','Y').to_euler()
    d=bpy.data.cameras.new('Camera');o=bpy.data.objects.new('Camera',d);s.collection.objects.link(o);o.location=(0,-10,7);o.rotation_euler=(-o.location).to_track_quat('-Z','Y').to_euler();d.type='ORTHO';d.ortho_scale=6.6;s.camera=o
    s.render.resolution_x=720;s.render.resolution_y=460;s.render.resolution_percentage=100;s.render.image_settings.file_format='PNG';s.render.image_settings.color_mode='RGBA';s.render.film_transparent=True;s.render.filepath=os.path.join(ROOT,'dist','assets',f'ship-{ident}.png')
    bpy.ops.render.render(write_still=True)
    print('FALLBACK_READY',ident,flush=True)
