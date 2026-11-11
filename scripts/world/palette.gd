extends RefCounted
## Shared materials and procedural shaders. All surfaces are original,
## generated from code: no textures are imported.

static var _cache: Dictionary = {}

const COLORS := {
	# Painted render and stone
	"wall_cream": Color(0.89, 0.85, 0.74),
	"wall_white": Color(0.93, 0.92, 0.88),
	"wall_pink": Color(0.88, 0.70, 0.68),
	"wall_blue": Color(0.62, 0.74, 0.82),
	"wall_yellow": Color(0.91, 0.82, 0.55),
	"wall_green": Color(0.66, 0.78, 0.66),
	"wall_ochre": Color(0.80, 0.62, 0.40),
	"wall_grey": Color(0.70, 0.70, 0.68),
	"wall_lilac": Color(0.76, 0.72, 0.84),
	"stone": Color(0.55, 0.53, 0.48),
	"stone_dark": Color(0.40, 0.39, 0.36),
	"granite": Color(0.62, 0.61, 0.58),
	"brick": Color(0.58, 0.30, 0.24),
	"timber": Color(0.20, 0.15, 0.12),
	"plaster_timber": Color(0.93, 0.90, 0.80),
	"paving": Color(0.50, 0.49, 0.46),
	"tarmac": Color(0.25, 0.25, 0.26),
	"grass": Color(0.33, 0.48, 0.25),
	"hill": Color(0.24, 0.35, 0.19),
	"tree": Color(0.20, 0.34, 0.18),
	"tree_dark": Color(0.14, 0.26, 0.14),
	"mud": Color(0.36, 0.32, 0.26),
	"rock": Color(0.42, 0.40, 0.37),
	# Details
	"glass": Color(0.10, 0.13, 0.17),
	"frame": Color(0.95, 0.95, 0.92),
	"door_green": Color(0.12, 0.30, 0.20),
	"door_red": Color(0.55, 0.12, 0.10),
	"door_blue": Color(0.14, 0.22, 0.42),
	"fascia_green": Color(0.10, 0.28, 0.20),
	"fascia_red": Color(0.50, 0.10, 0.09),
	"fascia_blue": Color(0.12, 0.20, 0.38),
	"fascia_black": Color(0.08, 0.08, 0.09),
	"fascia_cream": Color(0.92, 0.88, 0.75),
	"chimney_pot": Color(0.62, 0.36, 0.25),
	"lead": Color(0.35, 0.37, 0.40),
	"iron": Color(0.12, 0.13, 0.14),
	"iron_green": Color(0.18, 0.30, 0.25),
	"rail_white": Color(0.92, 0.92, 0.90),
	"lamp": Color(1.0, 0.92, 0.65),
	"gpo_red": Color(0.75, 0.08, 0.06),
	"wood": Color(0.45, 0.33, 0.22),
	"wood_light": Color(0.66, 0.52, 0.36),
	"rope": Color(0.70, 0.62, 0.45),
	"canvas": Color(0.82, 0.78, 0.68),
	# Boats
	"hull_blue": Color(0.12, 0.20, 0.38),
	"hull_red": Color(0.55, 0.14, 0.10),
	"hull_green": Color(0.13, 0.32, 0.22),
	"hull_white": Color(0.90, 0.90, 0.86),
	"hull_black": Color(0.08, 0.08, 0.09),
	"hull_grey": Color(0.42, 0.45, 0.48),
	"antifoul": Color(0.42, 0.12, 0.09),
	"deck": Color(0.62, 0.55, 0.42),
	# Occupation
	"olive": Color(0.31, 0.33, 0.21),
	"olive_dark": Color(0.22, 0.24, 0.15),
	"khaki": Color(0.52, 0.48, 0.32),
	"soviet_red": Color(0.72, 0.07, 0.06),
	"star_gold": Color(0.93, 0.76, 0.20),
	"sandbag": Color(0.66, 0.60, 0.45),
	"barrier": Color(0.92, 0.92, 0.90),
	# People
	"skin": Color(0.90, 0.72, 0.60),
	"boots": Color(0.08, 0.07, 0.07),
	"cap_band": Color(0.70, 0.08, 0.07),
	"visor": Color(0.05, 0.05, 0.06),
	"belt": Color(0.36, 0.22, 0.12),
	"tweed": Color(0.42, 0.36, 0.28),
	"navy": Color(0.10, 0.13, 0.25),
	# Gulls
	"gull_white": Color(0.97, 0.97, 0.95),
	"gull_grey": Color(0.66, 0.70, 0.74),
	"gull_black": Color(0.07, 0.07, 0.08),
	"beak": Color(0.98, 0.80, 0.18),
	"gonys": Color(0.85, 0.15, 0.08),
	# Items
	"chip": Color(0.96, 0.80, 0.40),
	"pasty": Color(0.82, 0.58, 0.28),
	"crust": Color(0.70, 0.50, 0.28),
	"paper": Color(0.93, 0.91, 0.84),
	"newsprint": Color(0.84, 0.82, 0.76),
	"manila": Color(0.80, 0.68, 0.45),
	"wax": Color(0.70, 0.06, 0.05),
	"poop": Color(0.97, 0.97, 0.93),
	"tea": Color(0.55, 0.36, 0.20),
	"enamel": Color(0.92, 0.92, 0.88),
}


static func color(key: String) -> Color:
	return COLORS.get(key, Color.MAGENTA)


## Returns a cached material for a palette key. Special keys map to shaders.
static func mat(key: String) -> Material:
	if _cache.has(key):
		return _cache[key]
	var m: Material
	match key:
		"slate":
			m = _shader_mat(SLATE_SHADER, {"base_color": Color(0.26, 0.28, 0.33)})
		"slate_old":
			m = _shader_mat(SLATE_SHADER, {"base_color": Color(0.31, 0.30, 0.31)})
		"cobble":
			m = _shader_mat(COBBLE_SHADER, {"stone_color": Color(0.50, 0.48, 0.45), "mortar_color": Color(0.27, 0.26, 0.25), "scale": 2.6})
		"setts":
			m = _shader_mat(COBBLE_SHADER, {"stone_color": Color(0.46, 0.46, 0.47), "mortar_color": Color(0.27, 0.27, 0.28), "scale": 1.9})
		"quay_wall":
			m = _shader_mat(STONE_SHADER, {"stone_color": Color(0.47, 0.45, 0.40), "mortar_color": Color(0.30, 0.29, 0.26), "course": 0.45})
		"stone_wall":
			m = _shader_mat(STONE_SHADER, {"stone_color": Color(0.58, 0.55, 0.49), "mortar_color": Color(0.40, 0.38, 0.34), "course": 0.35})
		"brick_wall":
			m = _shader_mat(STONE_SHADER, {"stone_color": Color(0.58, 0.29, 0.22), "mortar_color": Color(0.70, 0.66, 0.58), "course": 0.16})
		"water":
			m = _shader_mat(WATER_SHADER, {})
		"glass":
			var g := StandardMaterial3D.new()
			g.albedo_color = color("glass")
			g.roughness = 0.08
			g.metallic = 0.35
			m = g
		"lamp", "lamp_glow":
			var l := StandardMaterial3D.new()
			l.albedo_color = color("lamp")
			l.emission_enabled = true
			l.emission = color("lamp")
			l.emission_energy_multiplier = 0.6
			m = l
		"wake":
			var w := StandardMaterial3D.new()
			w.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
			w.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
			w.albedo_color = Color(0.92, 0.96, 0.96, 0.55)
			w.vertex_color_use_as_albedo = true
			m = w
		"shadow_blob":
			var s := StandardMaterial3D.new()
			s.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
			s.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
			s.albedo_color = Color(0, 0, 0, 0.38)
			s.no_depth_test = false
			m = s
		"marker_ring":
			var r := StandardMaterial3D.new()
			r.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
			r.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
			r.albedo_color = Color(1.0, 0.95, 0.75, 0.75)
			r.cull_mode = BaseMaterial3D.CULL_DISABLED
			r.no_depth_test = true
			r.render_priority = 2
			m = r
		"marker_hit":
			var mh := StandardMaterial3D.new()
			mh.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
			mh.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
			mh.albedo_color = Color(1.0, 0.35, 0.2, 0.9)
			mh.cull_mode = BaseMaterial3D.CULL_DISABLED
			mh.no_depth_test = true
			mh.render_priority = 2
			m = mh
		"cone":
			var c := StandardMaterial3D.new()
			c.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
			c.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
			c.vertex_color_use_as_albedo = true
			c.cull_mode = BaseMaterial3D.CULL_DISABLED
			c.albedo_color = Color(1, 1, 1, 1)
			m = c
		"flag_red":
			m = _shader_mat(FLAG_SHADER, {"flag_color": color("soviet_red")})
		"flag_union":
			m = _shader_mat(FLAG_SHADER, {"flag_color": Color(0.85, 0.85, 0.85)})
		_:
			var sm := StandardMaterial3D.new()
			sm.albedo_color = color(key)
			sm.roughness = 0.85
			sm.metallic_specular = 0.1 if key in ["paving", "grass", "hill", "tarmac", "rock", "mud", "sandbag", "tree", "tree_dark", "deck", "wood", "canvas"] else 0.3
			if key.begins_with("hull") or key in ["gpo_red", "door_red", "door_green", "door_blue", "fascia_green", "fascia_red", "fascia_blue", "fascia_black", "iron_green", "enamel", "visor", "boots"]:
				sm.roughness = 0.45
			if key in ["poop"]:
				sm.roughness = 0.25
			m = sm
	_cache[key] = m
	return m


## A plain coloured material for one-off props (cached by colour).
static func col(c: Color, rough := 0.8) -> StandardMaterial3D:
	var key := "c_%s_%.2f" % [c.to_html(), rough]
	if _cache.has(key):
		return _cache[key]
	var sm := StandardMaterial3D.new()
	sm.albedo_color = c
	sm.roughness = rough
	_cache[key] = sm
	return sm


static func unshaded(c: Color) -> StandardMaterial3D:
	var key := "u_%s" % c.to_html()
	if _cache.has(key):
		return _cache[key]
	var sm := StandardMaterial3D.new()
	sm.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	sm.albedo_color = c
	if c.a < 0.99:
		sm.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	_cache[key] = sm
	return sm


static func _shader_mat(code: String, params: Dictionary) -> ShaderMaterial:
	var sh := Shader.new()
	sh.code = code
	var sm := ShaderMaterial.new()
	sm.shader = sh
	for k in params.keys():
		sm.set_shader_parameter(k, params[k])
	return sm


const SLATE_SHADER := """
shader_type spatial;
uniform vec3 base_color : source_color = vec3(0.26, 0.28, 0.33);
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void fragment() {
	vec2 uv = UV;
	float rows = 3.4;
	float cols = 2.4;
	float row = floor(uv.y * rows);
	float off = mod(row, 2.0) * 0.5;
	vec2 cell = vec2(floor(uv.x * cols + off), row);
	vec2 f = vec2(fract(uv.x * cols + off), fract(uv.y * rows));
	float h = hash(cell);
	float edge = smoothstep(0.0, 0.08, f.y) * smoothstep(0.0, 0.03, f.x) * smoothstep(1.0, 0.97, f.x);
	vec3 c = base_color * (0.80 + 0.32 * h);
	c *= mix(0.55, 1.0, edge);
	c = mix(c, vec3(0.42, 0.45, 0.32), step(0.965, hash(cell + 7.1)) * 0.5);
	float aa = clamp(length(fwidth(uv * vec2(cols, rows))) * 1.2 - 0.3, 0.0, 1.0);
	c = mix(c, base_color * 0.88, aa);
	ALBEDO = c;
	ROUGHNESS = 0.62;
	SPECULAR = 0.35;
}
"""

const COBBLE_SHADER := """
shader_type spatial;
uniform vec3 stone_color : source_color = vec3(0.56, 0.54, 0.50);
uniform vec3 mortar_color : source_color = vec3(0.32, 0.31, 0.29);
uniform float scale = 3.2;
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void fragment() {
	vec2 p = UV * scale;
	float row = floor(p.y);
	p.x += mod(row, 2.0) * 0.5;
	vec2 i = floor(p);
	vec2 f = fract(p) - 0.5;
	float h = hash(i);
	float d = length(f * vec2(1.0, 1.15 + h * 0.2));
	float stone = smoothstep(0.52, 0.40, d);
	vec3 c = mix(mortar_color, stone_color * (0.78 + 0.34 * h), stone);
	c *= 0.92 + 0.12 * stone * (0.5 - d);
	// Fade the pattern to its average colour in the distance (no moire).
	float aa = clamp(length(fwidth(p)) * 1.5 - 0.3, 0.0, 1.0);
	c = mix(c, mix(mortar_color, stone_color, 0.62), aa);
	ALBEDO = c;
	ROUGHNESS = mix(0.95, 0.75, stone);
	SPECULAR = 0.15;
}
"""

const STONE_SHADER := """
shader_type spatial;
uniform vec3 stone_color : source_color = vec3(0.47, 0.45, 0.40);
uniform vec3 mortar_color : source_color = vec3(0.30, 0.29, 0.26);
uniform float course = 0.45;
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void fragment() {
	float row = floor(UV.y / course);
	float w = course * (2.0 + hash(vec2(row, 3.0)));
	float x = UV.x / w + mod(row, 2.0) * 0.5;
	vec2 cell = vec2(floor(x), row);
	vec2 f = vec2(fract(x), fract(UV.y / course));
	float h = hash(cell);
	float joint = smoothstep(0.0, 0.07, f.y) * smoothstep(1.0, 0.93, f.y) * smoothstep(0.0, 0.03, f.x) * smoothstep(1.0, 0.97, f.x);
	vec3 c = mix(mortar_color, stone_color * (0.8 + 0.3 * h), joint);
	float aa = clamp(length(fwidth(UV / course)) * 1.5 - 0.3, 0.0, 1.0);
	c = mix(c, mix(mortar_color, stone_color, 0.75), aa);
	ALBEDO = c;
	ROUGHNESS = 0.9;
	SPECULAR = 0.2;
}
"""

const WATER_SHADER := """
shader_type spatial;
render_mode specular_schlick_ggx;
uniform vec3 deep_color : source_color = vec3(0.05, 0.15, 0.16);
uniform vec3 shallow_color : source_color = vec3(0.10, 0.23, 0.22);
varying vec3 wpos;
void vertex() {
	wpos = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
	VERTEX.y += sin(wpos.x * 0.31 + TIME * 1.2) * 0.05 + sin(wpos.z * 0.23 - TIME * 0.9) * 0.05;
}
void fragment() {
	vec2 p = wpos.xz;
	float t = TIME;
	float nx = cos(p.x * 0.9 + t * 1.6) * 0.10 + cos(p.x * 2.1 - p.y * 1.3 + t * 2.4) * 0.06 + cos(p.x * 5.3 + p.y * 3.1 + t * 3.7) * 0.03;
	float nz = cos(p.y * 1.1 - t * 1.3) * 0.10 + cos(p.y * 2.7 + p.x * 0.9 - t * 2.1) * 0.06 + cos(p.y * 6.1 - p.x * 2.3 + t * 3.1) * 0.03;
	vec3 n = normalize(vec3(nx, 1.0, nz));
	NORMAL = normalize((VIEW_MATRIX * vec4(n, 0.0)).xyz);
	float fres = pow(1.0 - clamp(dot(NORMAL, VIEW), 0.0, 1.0), 4.0);
	float patch = 0.5 + 0.5 * sin(p.x * 0.045 + sin(p.y * 0.03)) * sin(p.y * 0.06);
	ALBEDO = mix(deep_color, shallow_color, patch * 0.6);
	ROUGHNESS = 0.14;
	SPECULAR = 0.55;
	EMISSION = vec3(0.55, 0.64, 0.70) * fres * 0.55;
}
"""

const FLAG_SHADER := """
shader_type spatial;
render_mode cull_disabled;
uniform vec3 flag_color : source_color = vec3(0.72, 0.07, 0.06);
void vertex() {
	float k = UV.x;
	VERTEX.z += sin(UV.x * 6.0 - TIME * 4.0) * 0.12 * k;
}
void fragment() {
	ALBEDO = flag_color * (0.85 + 0.15 * sin(UV.x * 6.0 - TIME * 4.0));
	ROUGHNESS = 0.9;
}
"""
