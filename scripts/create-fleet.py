"""Reproducible original hard-surface spacecraft. Run Blender --background --python this_file.
Blender +X nose, +Z up -> glTF +X nose, +Y up. No textures/external assets.
"""
import bpy, math, os, json
from mathutils import Vector

ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT=os.path.join(ROOT,'dist','assets')
os.makedirs(OUT,exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)

def material(name,color,metal=.7,rough=.3,emission=0):
    m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True
    p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*color,1)
    p.inputs['Metallic'].default_value=metal;p.inputs['Roughness'].default_value=rough
    if emission:p.inputs['Emission Color'].default_value=(*color,1);p.inputs['Emission Strength'].default_value=emission
    return m

alloy=material('Ceramic titanium',(.68,.77,.85),.65,.28)
edge=material('Machined silver',(.27,.37,.45),.82,.25)
dark=material('Graphite frame',(.028,.048,.072),.7,.35)
black=material('Carbon insets',(.007,.018,.025),.3,.48)
gold=material('Copper contacts',(.8,.4,.11),.75,.32)
glass=material('Polarized canopy',(.025,.15,.22),.68,.13)
cyan=material('Ion cyan',(.01,.68,1),.25,.24,3)
violet=material('Ion violet',(.5,.13,1),.2,.24,2.6)
white=material('Navigation white',(.65,.85,1),.1,.3,3)
light=cyan

def finish(obj,mat,bevel=0):
    obj.data.materials.append(mat)
    if bevel:
        mod=obj.modifiers.new('Machined edges','BEVEL');mod.width=bevel;mod.segments=2
        bpy.context.view_layer.objects.active=obj
        bpy.ops.object.modifier_apply(modifier=mod.name)
        mod=obj.modifiers.new('Weighted normals','WEIGHTED_NORMAL')
        try:bpy.ops.object.modifier_apply(modifier=mod.name)
        except RuntimeError:pass
    return obj

def block(name,loc,scale,mat=alloy,bevel=.03):
    bpy.ops.mesh.primitive_cube_add(size=1,location=loc);o=bpy.context.object;o.name=name
    o.scale=scale;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    return finish(o,mat,bevel)

def hull(name,sections,mat=alloy,y=0,z=0):
    # Eight-sided shell cross sections give a crisp keel and sloped armor without a naval hull.
    verts=[]
    for x,w,h,zc in sections:
        for k in range(8):
            a=2*math.pi*k/8+math.pi/8;verts.append((x,y+math.cos(a)*w,z+zc+math.sin(a)*h))
    faces=[tuple(reversed(range(8)))]
    for j in range(len(sections)-1):
        for k in range(8):faces.append((j*8+k,j*8+(k+1)%8,(j+1)*8+(k+1)%8,(j+1)*8+k))
    faces.append(tuple(range((len(sections)-1)*8,len(sections)*8)))
    mesh=bpy.data.meshes.new(name);mesh.from_pydata(verts,[],faces);mesh.update()
    obj=bpy.data.objects.new(name,mesh);bpy.context.collection.objects.link(obj);finish(obj,mat,.025)
    return obj

def plate(name,points,z,thick,mat=alloy):
    n=len(points);verts=[(x,y,z-thick/2) for x,y in points]+[(x,y,z+thick/2) for x,y in points]
    faces=[tuple(reversed(range(n))),tuple(range(n,n*2))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
    mesh=bpy.data.meshes.new(name);mesh.from_pydata(verts,[],faces);mesh.update()
    obj=bpy.data.objects.new(name,mesh);bpy.context.collection.objects.link(obj);return finish(obj,mat,.025)

def cylinder(name,loc,r,depth,mat,axis='X',vertices=24):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices,radius=r,depth=depth,location=loc)
    obj=bpy.context.object;obj.name=name
    if axis=='X':obj.rotation_euler[1]=math.pi/2
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    return finish(obj,mat,.018)

def torus(name,loc,major,minor,mat,axis='Z',scale=None):
    bpy.ops.mesh.primitive_torus_add(major_segments=48,minor_segments=8,location=loc,major_radius=major,minor_radius=minor)
    o=bpy.context.object;o.name=name
    if axis=='X':o.rotation_euler[1]=math.pi/2
    if scale:o.scale=scale
    return finish(o,mat)

def mount(name,loc):
    o=bpy.data.objects.new(name,None);bpy.context.collection.objects.link(o);o.location=loc;o.empty_display_size=.15

engine_count=0
def engine(x,y,z,r=.23,length=.9):
    global engine_count
    cylinder('Thruster outer shell',(x,y,z),r,length,dark)
    cylinder('Thruster armor',(x+.11,y,z),r*1.12,length*.56,alloy)
    for dx in [-.28,-.05,.17]:torus('Engine clamp',(x+dx*length,y,z),r*1.02,.035,edge,'X')
    end=x-length/2-.012
    cylinder('Nozzle void',(end,y,z),r*.86,.022,black)
    torus('Ion annulus',(end-.02,y,z),r*.67,r*.09,light,'X')
    cylinder('Ion core',(end-.025,y,z),r*.42,.03,light)
    engine_count+=1;mount(f'engine_{engine_count}',(end-.08,y,z))

def spine(tier=1):
    hull('Carbon main chassis',[(-2.25,.48,.21,0),(-1.4,.57,.33,0),(.25,.47,.29,0),(1.7,.24,.18,.01),(2.95,.012,.012,.015)],dark)
    # Separate armor panels with honest seams, not drawn-on lines.
    segments=[(-2.18,-1.45,.49,.3),(-1.4,-.57,.53,.32),(-.52,.3,.47,.3),(.35,1.15,.38,.25),(1.2,1.91,.24,.19),(1.96,2.82,.13,.11)]
    for a,b,w,h in segments:hull('Segmented dorsal armor',[(a,w,h,.06),(b,w*.72,h*.7,.065)],alloy)
    hull('Canopy frame',[(-.2,.25,.12,.34),(.35,.28,.19,.38),(1.12,.13,.12,.31),(1.4,.01,.01,.23)],dark)
    hull('Blue crystal cockpit',[(-.15,.19,.09,.37),(.37,.23,.15,.4),(1.1,.10,.085,.34),(1.3,.015,.01,.27)],glass)
    for side in [-1,1]:
        for i in range(5):
            x=-1.85+i*.55;w=.52-max(0,x)*.17
            block('Side armor seam',(x,side*w,-.03),(.34,.12,.23),edge,.025)
            block('Side light',(x+.04,side*(w+.067),.03),(.17,.025,.038),light,.005)
        plate('Forward ion rail',[(.55,side*.27),(1.74,side*.13),(2.3,side*.05),(1.35,side*.19)],.22,.022,light)
    block('Axial cannon',(2.13,0,-.15),(.78,.1,.1),dark,.01)

def wing(side,size=1,xshift=0,tier=1):
    def pts(a):return [(x*size+xshift,y*side*size) for x,y in a]
    plate('Swept composite wing',pts([(-1.9,.35),(-2.35,1.95),(-1.68,2.28),(.93,.7),(1.22,.25)]),-.06,.15,dark)
    plate('Wing upper armor',pts([(-1.75,.55),(-2.1,1.94),(-1.66,2.04),(.69,.74),(.55,.45)]),.06,.1,alloy)
    plate('Wing second armor',pts([(-1.65,.7),(-1.54,1.73),(-.86,1.28),(.15,.79)]),.14,.07,edge)
    plate('Wing ion strip',pts([(-2.08,1.89),(-1.72,1.98),(.49,.77),(.18,.86)]),.135,.025,light)
    plate('Wing copper vent',pts([(-1.58,1.73),(-1.22,1.49),(-1.03,1.43),(-1.47,1.78)]),.2,.025,gold)
    for j in range(tier+2):
        x=(-1.65+j*.19)*size+xshift;y=(.88+j*.095)*side*size
        b=block('Wing radiator',(x,y,.18),(.06*size,.35*size,.06),black,.008);b.rotation_euler[2]=side*.5
    engine(-1.3*size+xshift,side*1.1*size,-.02,.21*size,.95*size)
    hull('Outrigger cannon',[(-.7,.1,.1,0),(.8,.095,.07,0),(1.25,.025,.025,0)],edge,y=side*1.12*size,z=.14)

def disk(rank,ring=False,double=False):
    # Radially enclosed flight body, with segmented rim and exposed drive ring.
    rad=1.65+rank*.035
    if not ring:
        bpy.ops.mesh.primitive_uv_sphere_add(segments=48,ring_count=12,radius=1,location=(-.15,0,0));o=bpy.context.object;o.name='Flattened saucer pressure shell';o.scale=(rad*.94,rad,.32);finish(o,dark)
    torus('Drive ring',(-.15,0,.025),rad,.11,dark,scale=(.94,1,1))
    torus('Continuous ion band',(-.15,0,.055),rad+.01,.035,light,scale=(.94,1,1))
    for j in range(16 if rank<10 else 24):
        n=16 if rank<10 else 24;a=j*2*math.pi/n;b=(j+.85)*2*math.pi/n
        inner=rad*(.76 if ring else .35)
        points=[(-.15+math.cos(a)*inner*.94,math.sin(a)*inner),(-.15+math.cos(a)*rad*.94,math.sin(a)*rad),(-.15+math.cos(b)*rad*.94,math.sin(b)*rad),(-.15+math.cos(b)*inner*.94,math.sin(b)*inner)]
        plate('Radial armor sector',points,.12,.13,alloy if j%3 else edge)
        if rank>9:
            xx=-.15+math.cos((a+b)/2)*rad*.84*.94;yy=math.sin((a+b)/2)*rad*.84
            o=block('Ring cooling module',(xx,yy,.25),(.14,.23,.12),dark,.015);o.rotation_euler[2]=(a+b)/2
    if double:torus('Secondary floating collar',(-.15,0,.26),rad*.69,.07,edge,scale=(.94,1,1));torus('Secondary ion collar',(-.15,0,.28),rad*.7,.022,light,scale=(.94,1,1))
    cylinder('Dorsal power core',(-.3,0,.28),.37,.15,dark,'Z')
    torus('Reactor halo',(-.3,0,.38),.3,.04,light)
    cylinder('Power aperture',(-.3,0,.39),.17,.03,light,'Z')

def crescent(rank):
    for side in [-1,1]:
        pts=[(-2.2,side*.35),(-2.45,side*1.25),(-1.7,side*2.13),(-.45,side*2.4),(1.5,side*1.95),(2.35,side*1.06),(1.0,side*1.45),(-.25,side*1.5),(-1.04,side*.88),(-.82,side*.4)]
        plate('Crescent structural spar',pts,-.02,.25,dark)
        for j in range(4):
            x=-1.7+j*.75;y=side*(1.75+(.15 if j in [1,2] else -.1))
            plate('Crescent armor scale',[(x-.38,y-side*.26),(x-.23,y+side*.35),(x+.47,y+side*.24),(x+.57,y-side*.22)],.14,.11,alloy)
            block('Crescent plasma slit',(x+.06,y+side*.22,.22),(.32,.045,.033),light,.01)
        engine(-1.6,side*1.15,-.04,.26,.9)
        if rank>10:engine(-1.9,side*.72,-.07,.2,.72)

def make(rank,player=False):
    global light,engine_count
    bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
    light=cyan if player else violet;engine_count=0
    spine(rank)
    if player or rank in [2,3,8,12]:
        for side in [-1,1]:
            wing(side,1 if player else (.73 if rank<4 else 1.04),0,2 if player else max(1,rank//4))
            if player or rank>=8:
                wing(side,.55,.62,1)
                # Angled fins, explicitly spacefighter rather than a tall naval bridge.
                hull('Dorsal stabilizer root',[(-2.1,.07,.08,.26),(-1.65,.075,.28,.4),(-1.35,.025,.06,.28)],alloy,y=side*.32)
    elif rank in [4,6,10,11,14,15,16]:
        disk(rank,rank in [6,10,14],rank>=10)
        if rank>=14:
            for side in [-1,1]:wing(side,.75,-.1,3)
            if rank==16:
                torus('Starcore outer horizon',(-.55,0,.02),2.52,.1,edge,scale=(.75,1,1))
                torus('Starcore luminous horizon',(-.55,0,.1),2.53,.022,light,scale=(.75,1,1))
        for side in [-1,1]:engine(-1.45,side*.8,-.17,.23+rank*.006,.82)
    elif rank in [7,13]:crescent(rank)
    elif rank in [5,9]:
        for side in [-1,1]:
            y=side*1.03
            plate('Catamaran crossbeam',[(-1.6,0),(-1.65,y),(.7,y),(.15,0)],-.08,.15,edge)
            hull('Armored outrigger',[(-2.05,.3,.22,0),(-1.15,.35,.3,0),(.55,.26,.21,.03),(2.15,.01,.01,.02)],alloy,y=y)
            for j in range(5):block('Pod radiator',(-1.5+j*.36,y,.26),(.1,.35,.045),black,.008)
            block('Pod ion line',(-.24,y+side*.29,.13),(1.4,.025,.04),light,.005)
            engine(-1.99,y,0,.28,.9)
            if rank==9:wing(side,.72,-.4,2)
    else:
        for side in [-1,1]:
            plate('Probe solar blade',[(-1.1,side*.35),(-1.5,side*1.0),(-.5,side*.8),(.3,side*.3)],-.03,.07,alloy)
            cylinder('Probe sensor',(1.2,side*.34,.15),.08,.3,light)
    engine(-2.02,0,-.07,.3 if rank<8 else .38,1)
    if rank>=8 or player:
        for side in [-1,1]:
            for j in range(3):
                block('Equipment armor',(-1.7+j*.48,side*.4,.34),(.32,.22,.18),edge,.035)
                block('Equipment contact',(-1.7+j*.48,side*.4,.44),(.12,.06,.025),gold,.006)
    mount('muzzle',(3,0,-.15));mount('shield_anchor',(0,0,0))
    # Merge meshes by material: stable low draw-call budget, preserve effect mounts.
    materials={o.data.materials[0].name for o in bpy.context.scene.objects if o.type=='MESH'}
    for mat in materials:
        bpy.ops.object.select_all(action='DESELECT');group=[o for o in bpy.context.scene.objects if o.type=='MESH' and o.data.materials[0].name==mat]
        for o in group:o.select_set(True)
        bpy.context.view_layer.objects.active=group[0];bpy.ops.object.join();group[0].name=mat
    meshes=[o for o in bpy.context.scene.objects if o.type=='MESH']
    corners=[o.matrix_world@Vector(c) for o in meshes for c in o.bound_box];xmin=min(c.x for c in corners);xmax=max(c.x for c in corners);center=(xmin+xmax)/2;scale=6/(xmax-xmin)
    for o in list(bpy.context.scene.objects):
        o.location.x-=center;o.location*=scale;o.scale*=scale
    name='ship-player' if player else f'ship-{rank:02}'
    bpy.ops.export_scene.gltf(filepath=os.path.join(OUT,name+'.glb'),export_format='GLB',export_yup=True,export_apply=True,export_extras=True)
    triangles=sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in meshes)
    print(json.dumps({'asset':name,'triangles':triangles,'meshes':len(meshes),'bytes':os.path.getsize(os.path.join(OUT,name+'.glb'))}))

for rank in range(1,17):make(rank)
make(12,True)

# Standalone beauty render validates the exported source geometry before browser integration.
world=bpy.data.worlds.new('Space studio');bpy.context.scene.world=world;world.use_nodes=True;world.node_tree.nodes['Background'].inputs[0].default_value=(.03,.055,.1,1);world.node_tree.nodes['Background'].inputs[1].default_value=.5
def area(name,loc,power,color,size):
    d=bpy.data.lights.new(name,'AREA');d.energy=power;d.color=color;d.shape='DISK';d.size=size;o=bpy.data.objects.new(name,d);bpy.context.collection.objects.link(o);o.location=loc;o.rotation_euler=(Vector((0,0,0))-o.location).to_track_quat('-Z','Y').to_euler()
area('Softbox',(-1,-4,7),1500,(.72,.88,1),7);area('Edge',(-2,4,3),1800,(.18,.6,1),5);area('Warm front',(5,-1,3),900,(1,.82,.62),4)
d=bpy.data.cameras.new('Preview camera');cam=bpy.data.objects.new('Preview camera',d);bpy.context.collection.objects.link(cam);cam.location=(6.5,-10,7);cam.rotation_euler=(-cam.location).to_track_quat('-Z','Y').to_euler();d.type='ORTHO';d.ortho_scale=8.8
s=bpy.context.scene;s.camera=cam;s.render.engine='CYCLES';s.cycles.samples=24
try:
    prefs=bpy.context.preferences.addons['cycles'].preferences;prefs.compute_device_type='OPTIX';prefs.get_devices()
    for dev in prefs.devices:dev.use=dev.type!='CPU'
    s.cycles.device='GPU'
except Exception:s.cycles.device='CPU'
s.render.resolution_x=1200;s.render.resolution_y=760;s.render.resolution_percentage=100;s.render.image_settings.file_format='PNG';s.render.filepath=os.path.join(ROOT,'.local','player-model-preview.png');s.render.film_transparent=False
bpy.ops.render.render(write_still=True)
