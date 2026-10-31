"""Quetzal holografico: modelado artistico en Blender (bpy), guiado por docs/referencia/quetzal-ref.png.

Uso:  blender -b -P tools/blender/build_quetzal.py -- [--render] [--glb]
Unidades: 1 u = 80 px de la imagen de referencia; el centro del anillo es ~(0.2, 0.55).
Las plumas "heroe" se definen a mano con puntos de control tomados de la referencia; las plumas de relleno
se interpolan entre heroes vecinos (como haria un artista al apilar capas). No importa nada del modelo procedural de la web.
"""
import bpy, bmesh, math, sys, os, random
from mathutils import Vector

ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT = os.path.join(ROOT, 'public', 'models')
RENDERS = os.path.join(ROOT, 'docs', 'capturas-glb')
random.seed(7)

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene

# ---------------------------------------------------------------- utilidades
def bez(p0, p1, p2, p3, t):
    a = (1 - t) ** 3; b = 3 * (1 - t) ** 2 * t; c = 3 * (1 - t) * t * t; d = t ** 3
    return Vector([a * p0[i] + b * p1[i] + c * p2[i] + d * p3[i] for i in range(3)])

def v3(p):
    return (p[0], p[1], p[2] if len(p) > 2 else 0.0)

def lerp_pts(A, B, f):
    return [tuple(A[i][j] * (1 - f) + B[i][j] * f for j in range(3)) for i in range(4)]

def new_obj(name, bm, mat=None):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(ob)
    if mat: me.materials.append(mat)
    for p in me.polygons: p.use_smooth = True
    return ob

def color_layer(bm):
    return bm.loops.layers.color.get('Col') or bm.loops.layers.color.new('Col')

def feather(pts, width, cup=0.35, droop=0.25, curl=0.0, tone=0.0, phase=0.0, serr=0.0, thick=0.03, N=46, M=9, seed=0):
    """Pluma lanceolada con raquis elevado, copa, serracion del filo y punta ondulada."""
    P = [v3(p) for p in pts]
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new('UVMap'); col = color_layer(bm)
    rnd = random.Random(seed)
    sphase = rnd.random() * 6.28
    rows = []
    for i in range(N):
        t = i / (N - 1)
        c = bez(*P, t)
        c2 = bez(*P, min(1, t + 0.01)); c1 = bez(*P, max(0, t - 0.01))
        tg = (c2 - c1); tg.z = 0
        if tg.length < 1e-6: tg = Vector((1, 0, 0))
        tg.normalize(); sd = Vector((-tg.y, tg.x, 0))
        shape = math.pow(max(0.0, math.sin(math.pi * math.pow(t, 0.62))), 0.8)
        saw = 1 - serr * max(0.0, t - 0.35) * (0.5 + 0.5 * math.sin(t * 38 + sphase))
        w = width * shape * saw
        tipwave = curl * (t ** 3) * width
        row = []
        for j in range(M):
            u = -1 + 2 * j / (M - 1)
            side = u * w
            z = cup * w * (1 - u * u) * 0.5 - droop * w * (u * u) + 0.06 * w * (1 - abs(u)) ** 3
            pos = c + sd * (side + tipwave) + Vector((0, 0, z))
            v = bm.verts.new(pos)
            row.append((v, u, t))
        rows.append(row)
    for i in range(N - 1):
        for j in range(M - 1):
            try:
                f = bm.faces.new((rows[i][j][0], rows[i][j + 1][0], rows[i + 1][j + 1][0], rows[i + 1][j][0]))
            except ValueError:
                continue
            for lp, (vv, u, t) in zip(f.loops, (rows[i][j], rows[i][j + 1], rows[i + 1][j + 1], rows[i + 1][j])):
                lp[uv].uv = (u * 0.5 + 0.5, t)
                lp[col] = (tone * max(0.0, (t - 0.86) / 0.14), phase, t, 1.0)
    bm.normal_update()
    ob = new_obj('f', bm, MAT_FEATHER)
    sol = ob.modifiers.new('s', 'SOLIDIFY'); sol.thickness = thick; sol.offset = 0
    return ob

def tube(path, radii, segs=14, mat=None, tone=0.0, name='tube'):
    bm = bmesh.new(); col = color_layer(bm); uv = bm.loops.layers.uv.new('UVMap')
    n = len(path); rings = []
    for i, p in enumerate(path):
        p = Vector(p)
        a = Vector(path[min(i + 1, n - 1)]) - Vector(path[max(i - 1, 0)])
        a.normalize()
        ref = Vector((0, 0, 1)) if abs(a.z) < 0.9 else Vector((1, 0, 0))
        s = a.cross(ref).normalized(); r2 = a.cross(s).normalized()
        ring = []
        for k in range(segs):
            th = 2 * math.pi * k / segs
            ring.append(bm.verts.new(p + (s * math.cos(th) * radii[i][0] + r2 * math.sin(th) * radii[i][1])))
        rings.append(ring)
    for i in range(n - 1):
        for k in range(segs):
            f = bm.faces.new((rings[i][k], rings[i][(k + 1) % segs], rings[i + 1][(k + 1) % segs], rings[i + 1][k]))
            for lp in f.loops:
                lp[col] = (tone, 0.0, i / (n - 1), 1.0)
    bm.normal_update()
    return new_obj(name, bm, mat)

def bezpath(pts, n):
    P = [v3(p) for p in pts]
    return [tuple(bez(*P, i / (n - 1))) for i in range(n)]

# ---------------------------------------------------------------- materiales (render Blender; la web usa su propio shader sobre UV/colores)
def make_feather_mat():
    m = bpy.data.materials.new('cristal_pluma'); m.use_nodes = True
    nt = m.node_tree; nt.nodes.clear()
    N = nt.nodes.new; L = nt.links.new
    out = N('ShaderNodeOutputMaterial')
    uvn = N('ShaderNodeTexCoord'); sep = N('ShaderNodeSeparateXYZ'); L(uvn.outputs['UV'], sep.inputs[0])
    colat = N('ShaderNodeVertexColor'); colat.layer_name = 'Col'
    sepc = N('ShaderNodeSeparateColor'); L(colat.outputs['Color'], sepc.inputs[0])
    # distancia al filo y al raquis
    e = N('ShaderNodeMath'); e.operation = 'SUBTRACT'; L(sep.outputs[0], e.inputs[0]); e.inputs[1].default_value = 0.5
    ea = N('ShaderNodeMath'); ea.operation = 'ABSOLUTE'; L(e.outputs[0], ea.inputs[0])
    e2 = N('ShaderNodeMath'); e2.operation = 'MULTIPLY'; e2.inputs[1].default_value = 2.0; L(ea.outputs[0], e2.inputs[0])
    edge = N('ShaderNodeMapRange'); edge.inputs[1].default_value = 0.72; edge.inputs[2].default_value = 1.0; L(e2.outputs[0], edge.inputs[0])
    rib = N('ShaderNodeMapRange'); rib.inputs[1].default_value = 0.05; rib.inputs[2].default_value = 0.0; L(e2.outputs[0], rib.inputs[0])
    # barbas: bandas oblicuas
    wv = N('ShaderNodeTexWave'); wv.wave_type = 'BANDS'; wv.bands_direction = 'DIAGONAL'
    wv.inputs['Scale'].default_value = 26; wv.inputs['Distortion'].default_value = 3.0; wv.inputs['Detail'].default_value = 2.0
    L(uvn.outputs['UV'], wv.inputs['Vector'])
    vein = N('ShaderNodeMapRange'); vein.inputs[1].default_value = 0.78; vein.inputs[2].default_value = 0.95; L(wv.outputs[0], vein.inputs[0])
    # color a lo largo de la pluma
    ramp = N('ShaderNodeValToRGB'); L(sepc.outputs[2], ramp.inputs[0])
    ramp.color_ramp.elements[0].color = (0.01, 0.08, 0.6, 1); ramp.color_ramp.elements[1].color = (0.15, 0.75, 1.0, 1)
    el = ramp.color_ramp.elements.new(0.5); el.color = (0.01, 0.2, 0.85, 1)
    gold = N('ShaderNodeRGB'); gold.outputs[0].default_value = (1.0, 0.72, 0.28, 1)
    mixg = N('ShaderNodeMix'); mixg.data_type = 'RGBA'; L(sepc.outputs[0], mixg.inputs[0]); L(ramp.outputs[0], mixg.inputs[6]); L(gold.outputs[0], mixg.inputs[7])
    mixg.inputs[0].default_value = 0.0
    # emision = base + filo cian + barbas + raquis
    cy = N('ShaderNodeRGB'); cy.outputs[0].default_value = (0.35, 0.95, 1.0, 1)
    ed = N('ShaderNodeMix'); ed.data_type = 'RGBA'; L(edge.outputs[0], ed.inputs[0]); L(mixg.outputs[2], ed.inputs[6]); L(cy.outputs[0], ed.inputs[7])
    ve = N('ShaderNodeMix'); ve.data_type = 'RGBA'; L(vein.outputs[0], ve.inputs[0]); ve.inputs[0].default_value = 0.0
    L(vein.outputs[0], ve.inputs[0]); L(ed.outputs[2], ve.inputs[6]); ve.inputs[7].default_value = (0.7, 0.95, 1.0, 1)
    fac = N('ShaderNodeMath'); fac.operation = 'MULTIPLY'; fac.inputs[1].default_value = 0.35; L(vein.outputs[0], fac.inputs[0]); L(fac.outputs[0], ve.inputs[0])
    rb = N('ShaderNodeMix'); rb.data_type = 'RGBA'; L(rib.outputs[0], rb.inputs[0]); L(ve.outputs[2], rb.inputs[6]); rb.inputs[7].default_value = (0.8, 1.0, 1.0, 1)
    em = N('ShaderNodeEmission'); L(rb.outputs[2], em.inputs[0])
    es = N('ShaderNodeMath'); es.operation = 'ADD'; es.inputs[1].default_value = 0.5; L(edge.outputs[0], es.inputs[0])
    es2 = N('ShaderNodeMath'); es2.operation = 'MULTIPLY'; es2.inputs[1].default_value = 2.4; L(es.outputs[0], es2.inputs[0]); L(es2.outputs[0], em.inputs[1])
    # cuerpo cristalino: vidrio azul + emision
    gl = N('ShaderNodeBsdfGlass'); gl.inputs['Color'].default_value = (0.3, 0.7, 1.0, 1); gl.inputs['Roughness'].default_value = 0.08; gl.inputs['IOR'].default_value = 1.15
    lw = N('ShaderNodeLayerWeight'); lw.inputs['Blend'].default_value = 0.35
    mx = N('ShaderNodeMixShader'); L(lw.outputs['Facing'], mx.inputs[0]); L(em.outputs[0], mx.inputs[1]); L(gl.outputs[0], mx.inputs[2])
    mx.inputs[0].default_value = 0.0
    tr = N('ShaderNodeBsdfTransparent'); mt = N('ShaderNodeMixShader'); mt.inputs[0].default_value = 0.62
    L(mx.outputs[0], mt.inputs[2]); L(tr.outputs[0], mt.inputs[1])
    L(mt.outputs[0], out.inputs['Surface'])
    m.blend_method = 'BLEND' if hasattr(m, 'blend_method') else None
    return m

def make_solid_mat(name, base, emis, strength):
    m = bpy.data.materials.new(name); m.use_nodes = True
    nt = m.node_tree; b = nt.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = base; b.inputs['Roughness'].default_value = 0.18
    b.inputs['Metallic'].default_value = 0.2
    b.inputs['Emission Color'].default_value = emis; b.inputs['Emission Strength'].default_value = strength
    return m

MAT_FEATHER = make_feather_mat()
def make_rim_mat(name):
    m = bpy.data.materials.new(name); m.use_nodes = True
    nt = m.node_tree; nt.nodes.clear(); N = nt.nodes.new; L = nt.links.new
    out = N('ShaderNodeOutputMaterial'); lw = N('ShaderNodeLayerWeight'); lw.inputs['Blend'].default_value = 0.45
    ramp = N('ShaderNodeValToRGB'); L(lw.outputs['Fresnel'], ramp.inputs[0])
    ramp.color_ramp.elements[0].position = 0.15; ramp.color_ramp.elements[0].color = (0.004, 0.05, 0.40, 1)
    ramp.color_ramp.elements[1].position = 0.75; ramp.color_ramp.elements[1].color = (0.35, 0.95, 1.0, 1)
    em = N('ShaderNodeEmission'); em.inputs[1].default_value = 2.4; L(ramp.outputs[0], em.inputs[0])
    gl = N('ShaderNodeBsdfGlass'); gl.inputs['Color'].default_value = (0.2, 0.55, 1.0, 1); gl.inputs['Roughness'].default_value = 0.05
    mx = N('ShaderNodeMixShader'); mx.inputs[0].default_value = 0.35; L(em.outputs[0], mx.inputs[1]); L(gl.outputs[0], mx.inputs[2])
    L(mx.outputs[0], out.inputs['Surface'])
    return m
MAT_BODY = make_rim_mat('cuerpo_cristal')
MAT_GOLD = make_solid_mat('oro', (1.0, 0.8, 0.45, 1), (1.0, 0.7, 0.3, 1), 0.9)
MAT_EYE = make_solid_mat('ojo', (0.6, 1, 1, 1), (0.5, 1.0, 1.0, 1), 14.0)
MAT_RING = make_solid_mat('anillo', (0.02, 0.15, 0.7, 1), (0.05, 0.4, 1.0, 1), 1.1)
MAT_GLOBE = make_solid_mat('globo', (0.05, 0.3, 0.9, 1), (0.1, 0.55, 1.0, 1), 1.2)

# ---------------------------------------------------------------- plumas heroe (de la referencia)
def H(a, b, c, d, w, z, **kw):
    return dict(pts=[(*a, z), (*b, z), (*c, z), (*d, z)], w=w, z=z, **kw)

CREST = [  # cresta en llama, de adelante hacia atras
    H((0.10, 2.25), (0.45, 2.9), (0.25, 3.5), (-0.30, 3.85), 0.55, 0.25, curl=-0.35, tone=0.0),
    H((-0.05, 2.25), (-0.45, 3.0), (-0.95, 3.7), (-1.35, 4.25), 0.60, 0.15, curl=0.30),
    H((-0.15, 2.2), (-1.0, 2.9), (-1.9, 3.55), (-2.55, 4.05), 0.62, 0.05, curl=0.30),
    H((-0.25, 2.05), (-1.8, 2.7), (-3.2, 3.2), (-4.30, 3.20), 0.62, -0.05, curl=0.35),
    H((-0.30, 1.85), (-2.2, 2.2), (-4.0, 2.2), (-5.45, 2.05), 0.55, -0.15, curl=0.35),
]
WINGS = [  # alas curvadas en espiral antihoraria
    H((-0.35, 1.45), (-3.0, 1.7), (-5.1, 0.55), (-4.65, -0.20), 0.85, -0.25, curl=0.4),
    H((-0.30, 1.15), (-2.7, 1.2), (-4.7, -0.5), (-3.85, -2.25), 0.85, -0.35, curl=0.4),
    H((-0.25, 0.90), (-2.3, 0.8), (-4.1, -1.8), (-2.45, -3.30), 0.8, -0.45, curl=0.4),
    H((-0.15, 0.60), (-1.8, 0.4), (-3.0, -2.6), (-0.80, -3.60), 0.72, -0.55, curl=0.35),
]
INNER = [  # espiral interior mas corta (da profundidad y evita el hueco central)
    H((-0.15, 1.35), (-1.9, 1.4), (-3.2, 0.2), (-2.85, -0.85), 0.62, 0.05, curl=0.3),
    H((-0.10, 1.05), (-1.6, 0.9), (-2.8, -0.7), (-2.0, -2.0), 0.6, 0.0, curl=0.3),
    H((0.00, 0.75), (-1.3, 0.5), (-2.2, -1.4), (-1.15, -2.6), 0.55, -0.05, curl=0.3),
]
TAIL = [
    H((0.50, -1.0), (0.95, -3.0), (3.2, -3.55), (4.55, -2.65), 0.62, 0.30, curl=-0.1, tone=1.0),
    H((0.35, -0.85), (0.65, -2.7), (2.9, -3.2), (4.10, -2.40), 0.55, 0.20, curl=-0.1, tone=0.6),
    H((0.15, -0.80), (0.15, -3.1), (2.4, -3.95), (3.0, -3.55), 0.5, 0.10, curl=-0.1, tone=0.0),
]

def fan(heroes, extra, zjit=0.03, tag='f', gold_tail=False):
    objs = []; s = 0
    for i, h in enumerate(heroes):
        objs.append(feather(h['pts'], h['w'], cup=0.5, droop=0.35, curl=h.get('curl', 0), tone=h.get('tone', 0), phase=random.random(), serr=0.25, seed=s)); s += 1
        if i + 1 < len(heroes):
            for k in range(1, extra + 1):
                f = k / (extra + 1)
                pts = lerp_pts(h['pts'], heroes[i + 1]['pts'], f)
                w = h['w'] * (1 - f) + heroes[i + 1]['w'] * f
                z = h['z'] * (1 - f) + heroes[i + 1]['z'] * f + random.uniform(-zjit, zjit)
                sh = random.uniform(0.82, 1.0); o = pts[0]
                pts = [(o[0] + (p[0] - o[0]) * (1 - (1 - sh) * (i / 3.0)), o[1] + (p[1] - o[1]) * (1 - (1 - sh) * (i / 3.0)), z) for i, p in enumerate(pts)]
                objs.append(feather(pts, w * random.uniform(0.9, 1.1), cup=0.5, droop=0.35, curl=h.get('curl', 0) * (1 - f) + heroes[i + 1].get('curl', 0) * f,
                                    tone=h.get('tone', 0), phase=random.random(), serr=0.3, seed=s)); s += 1
    return objs

def join(objs, name):
    for ob in objs:
        bpy.context.view_layer.objects.active = ob
    for ob in objs:
        for md in list(ob.modifiers):
            bpy.context.view_layer.objects.active = ob
            bpy.ops.object.modifier_apply(modifier=md.name)
    bpy.ops.object.select_all(action='DESELECT')
    for ob in objs: ob.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    objs[0].name = name; objs[0].data.name = name
    return objs[0]

parts = {}
parts['plumas_cresta'] = join(fan(CREST, 0) + [feather([(0.05,2.3,0.35),(0.5,2.7,0.4),(0.8,3.1,0.3),(0.75,3.6,0.25)],0.3,cup=0.5,curl=-0.3,serr=0.2,seed=91),feather([(-0.1,2.3,0.3),(-0.7,2.9,0.3),(-1.6,3.2,0.25),(-2.1,3.7,0.2)],0.35,cup=0.5,curl=0.3,serr=0.2,seed=92),feather([(-0.2,2.1,0.2),(-1.5,2.3,0.15),(-2.9,2.5,0.1),(-3.6,2.55,0.05)],0.3,cup=0.5,curl=0.3,serr=0.2,seed=93)], 'plumas_cresta')
parts['plumas_alas'] = join(fan(WINGS, 2) + fan(INNER, 1), 'plumas_alas')
parts['cola'] = join(fan(TAIL, 1), 'cola')

# ---------------------------------------------------------------- cuerpo: cuello en S + plumaje en hileras
NECK = [(0.0, 1.70, 0.05), (-0.35, 1.15, 0.0), (-0.55, 0.45, -0.05), (-0.35, -0.35, 0.0), (0.15, -1.05, 0.1), (0.75, -1.65, 0.15)]
neck_path = bezpath([NECK[0], NECK[2], NECK[3], NECK[5]], 30)
radii = [(0.30 - 0.18 * (i / 29) ** 1.3 + 0.10 * math.sin(math.pi * i / 29), 0.26 - 0.15 * (i / 29)) for i in range(30)]
body = tube(neck_path, radii, 16, MAT_BODY, name='cuerpo')
chest = []
for i in range(26):
    t = 0.04 + 0.78 * i / 25
    p = bez(*[v3(q) for q in [NECK[0], NECK[2], NECK[3], NECK[5]]], t)
    p2 = bez(*[v3(q) for q in [NECK[0], NECK[2], NECK[3], NECK[5]]], min(1, t + 0.03))
    dr = (p2 - p); dr.z = 0; dr.normalize()
    for sgn, zz in ((1, 0.20), (-1, -0.2)):
        ang = math.radians(25 + 12 * math.sin(i))
        d = Vector((dr.x * math.cos(ang) - dr.y * math.sin(ang) * sgn, dr.y * math.cos(ang) + dr.x * math.sin(ang) * sgn, 0))
        L_ = 0.55 + 0.25 * math.sin(i * 0.9) ** 2
        a = (p.x - dr.y * 0.1 * sgn, p.y + dr.x * 0.1 * sgn, zz)
        b = (a[0] + dr.x * L_ * 0.35, a[1] + dr.y * L_ * 0.35, zz + 0.15 * sgn)
        c = (a[0] + dr.x * L_ * 0.7 + d.x * 0.2, a[1] + dr.y * L_ * 0.7 + d.y * 0.2, zz + 0.2 * sgn)
        e = (a[0] + dr.x * L_ + d.x * 0.35, a[1] + dr.y * L_ + d.y * 0.35, zz + 0.1 * sgn)
        chest.append(feather([a, b, c, e], 0.17, cup=0.6, droop=0.4, curl=0.1 * sgn, phase=random.random(), serr=0.2, N=16, M=7, seed=i))
parts['cuerpo'] = join([body] + chest, 'cuerpo')

# ---------------------------------------------------------------- cabeza: craneo, pico en gancho, ojo, ceja
def sphere_obj(name, r, loc, scl, mat, seg=32, rings=20):
    bm = bmesh.new(); bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=rings, radius=r)
    for v in bm.verts:
        v.co.x *= scl[0]; v.co.y *= scl[1]; v.co.z *= scl[2]
        v.co += Vector(loc)
    col = color_layer(bm)
    for f in bm.faces:
        for lp in f.loops: lp[col] = (0, 0, 0.3, 1)
    return new_obj(name, bm, mat)

skull = sphere_obj('craneo', 0.5, (0.08, 1.95, 0.0), (1.25, 0.88, 0.9), MAT_BODY)
# frente/nuca estilizada: carga la nuca hacia atras (-x)
nape = tube([(-0.05, 2.0, 0), (-0.35, 1.85, 0), (-0.6, 1.6, 0)], [(0.32, 0.30), (0.26, 0.24), (0.14, 0.12)], 14, MAT_BODY, name='nuca')
beak_up = bezpath([(0.40, 1.98, 0), (0.62, 2.0, 0), (0.78, 1.78, 0), (0.66, 1.18, 0)], 18)
beak = tube(beak_up, [(0.17 * (1 - (i / 17) ** 1.2) + 0.012, 0.15 * (1 - (i / 17) ** 1.2) + 0.012) for i in range(18)], 12, MAT_GOLD, tone=1.0, name='pico')
beak_low = tube(bezpath([(0.40, 1.80, 0), (0.55, 1.72, 0), (0.60, 1.55, 0), (0.55, 1.35, 0)], 10),
                [(0.10 * (1 - (i / 9)) + 0.015, 0.09 * (1 - (i / 9)) + 0.015) for i in range(10)], 10, MAT_GOLD, tone=1.0, name='mandibula')
eye = sphere_obj('ojo', 0.11, (0.26, 2.02, 0.36), (1.2, 0.8, 0.6), MAT_EYE, 16, 10)
eye2 = sphere_obj('ojo2', 0.11, (0.26, 2.02, -0.36), (1.2, 0.8, 0.6), MAT_EYE, 16, 10)
brow = [feather([(0.05, 2.13, 0.3), (0.2, 2.25, 0.38), (0.5, 2.28, 0.3), (0.72, 2.12, 0.2)], 0.1, cup=0.5, droop=0.3, N=14, M=5, seed=3),
        feather([(0.05, 2.13, -0.3), (0.2, 2.25, -0.38), (0.5, 2.28, -0.3), (0.72, 2.12, -0.2)], 0.1, cup=0.5, droop=0.3, N=14, M=5, seed=4)]
cheek = []
for i in range(7):
    for sgn in (1, -1):
        a = (-0.1 - 0.06 * i, 1.85 - 0.05 * i, 0.28 * sgn)
        cheek.append(feather([a, (a[0] - 0.2, a[1] - 0.12, a[2] * 1.2), (a[0] - 0.45, a[1] - 0.2, a[2] * 1.1), (a[0] - 0.7, a[1] - 0.45, a[2])], 0.14, cup=0.6, droop=0.4, N=14, M=6, seed=20 + i))
parts['cabeza'] = join([skull, nape, beak, beak_low, eye, eye2] + brow + cheek, 'cabeza')
for v in parts['cabeza'].data.vertices:
    c0 = Vector((0.0, 1.95, 0.0)); v.co = c0 + (v.co - c0) * 1.4

# ---------------------------------------------------------------- anillo holografico + globo
def ring_arc(a0, a1, r, width, thick, cx, cy, name, mat=MAT_RING, n=120, z=0.0):
    bm = bmesh.new(); col = color_layer(bm)
    rows = []
    for i in range(n):
        a = math.radians(a0 + (a1 - a0) * i / (n - 1))
        d = Vector((math.cos(a), math.sin(a), 0)); row = []
        for (rr, zz) in ((r - width / 2, -thick / 2), (r + width / 2, -thick / 2), (r + width / 2 * 0.9, thick / 2), (r - width / 2 * 0.9, thick / 2)):
            row.append(bm.verts.new((cx + d.x * rr, cy + d.y * rr, z + zz)))
        rows.append(row)
    for i in range(n - 1):
        for k in range(4):
            f = bm.faces.new((rows[i][k], rows[i][(k + 1) % 4], rows[i + 1][(k + 1) % 4], rows[i + 1][k]))
            for lp in f.loops: lp[col] = (0, 0, i / n, 1)
    bm.normal_update()
    return new_obj(name, bm, mat)

CX, CY = 0.20, 0.55
ring = [ring_arc(-72, 108, 2.78, 0.34, 0.14, CX, CY, 'a1', z=-0.15),
        ring_arc(-60, 100, 2.5, 0.06, 0.05, CX, CY, 'a2', z=-0.15),
        ring_arc(-80, 112, 3.08, 0.04, 0.04, CX, CY, 'a3', z=-0.15)]
for k in range(46):  # marcas
    a = math.radians(-70 + 176 * k / 45)
    bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co.x *= 0.20; v.co.y *= 0.02; v.co.z *= 0.03
    bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=__import__('mathutils').Matrix.Rotation(a, 3, 'Z'))
    bmesh.ops.translate(bm, verts=bm.verts, vec=(CX + math.cos(a) * 2.78, CY + math.sin(a) * 2.78, -0.15))
    col = color_layer(bm)
    ring.append(new_obj('t', bm, MAT_RING))
parts['anillo'] = join(ring, 'anillo')

bm = bmesh.new(); bmesh.ops.create_uvsphere(bm, u_segments=20, v_segments=12, radius=1.12)
for v in bm.verts: v.co += Vector((0.45, -0.05, -0.75))
col = color_layer(bm)
globe = new_obj('globo', bm, MAT_GLOBE)
wf = globe.modifiers.new('w', 'WIREFRAME'); wf.thickness = 0.006; wf.use_replace = True
bpy.context.view_layer.objects.active = globe; bpy.ops.object.modifier_apply(modifier='w')
parts['globo'] = globe

# ---------------------------------------------------------------- estadisticas
tris = 0
for n, ob in parts.items():
    me = ob.data; t = sum(len(p.vertices) - 2 for p in me.polygons); tris += t
    print('PART', n, 'verts', len(me.vertices), 'tris', t)
print('TOTAL_TRIS', tris)

# ---------------------------------------------------------------- escena de render
def setup_render(w=1024, h=1024):
    world = bpy.data.worlds.new('w'); scene.world = world; world.use_nodes = True
    bg = world.node_tree.nodes['Background']; bg.inputs[0].default_value = (0.001, 0.004, 0.012, 1); bg.inputs[1].default_value = 1.0
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); bpy.context.collection.objects.link(cam)
    cam.data.lens = 85; cam.location = (-0.5, 0.2, 30); cam.rotation_euler = (0, 0, 0); scene.camera = cam
    scene.render.resolution_x = w; scene.render.resolution_y = h
    scene.render.engine = 'BLENDER_EEVEE_NEXT' if 'BLENDER_EEVEE_NEXT' in [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties['engine'].enum_items] else 'BLENDER_EEVEE'
    scene.render.film_transparent = False
    scene.view_settings.view_transform = 'Standard'
    scene.use_nodes = True
    nt = scene.node_tree; nt.nodes.clear()
    rl = nt.nodes.new('CompositorNodeRLayers'); gl = nt.nodes.new('CompositorNodeGlare'); gl.glare_type = 'BLOOM' if hasattr(gl, 'glare_type') else None
    cmp = nt.nodes.new('CompositorNodeComposite')
    try:
        gl.glare_type = 'FOG_GLOW'; gl.quality = 'HIGH'; gl.mix = 0.0; gl.threshold = 0.9; gl.size = 8
    except Exception as ex: print('glare', ex)
    nt.links.new(rl.outputs['Image'], gl.inputs['Image']); nt.links.new(gl.outputs['Image'], cmp.inputs['Image'])
    return cam

def render_views():
    os.makedirs(RENDERS, exist_ok=True)
    setup_render()
    piv = bpy.data.objects.new('piv', None); bpy.context.collection.objects.link(piv); piv.location = (0.2, 0.5, 0)
    for ob in parts.values(): ob.parent = piv; ob.matrix_parent_inverse = piv.matrix_world.inverted()
    for az in ((0,) if '--quick' in ARGS else (0, 30, 60)):
        piv.rotation_euler = (0, math.radians(az), 0); bpy.context.view_layer.update()
        scene.render.filepath = os.path.join(RENDERS, f'blender-az{az}.png')
        bpy.ops.render.render(write_still=True); print('RENDER', scene.render.filepath)

def export_glb():
    os.makedirs(OUT, exist_ok=True)
    bpy.ops.object.select_all(action='DESELECT')
    for ob in parts.values(): ob.select_set(True)
    bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, 'quetzal.glb'), export_format='GLB', use_selection=True,
                              export_apply=True, export_yup=True, export_texcoords=True, export_normals=True,
                              export_vertex_color='ACTIVE' if 'export_vertex_color' in bpy.ops.export_scene.gltf.get_rna_type().properties else 'MATERIAL',
                              export_materials='EXPORT', export_cameras=False, export_lights=False)
    print('GLB', os.path.getsize(os.path.join(OUT, 'quetzal.glb')))

if '--render' in ARGS: render_views()
if '--glb' in ARGS: export_glb()
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ROOT, 'tools', 'blender', 'quetzal.blend'))

