extends Node3D
## Anything that fits in a gull's single beak slot: snacks and mission items.

const Pal = preload("res://scripts/world/palette.gd")

enum State { PLACED, HELD, LOOSE, CARRIED_BY_GUARD, DELIVERED, CONSUMED }

const KINDS := {
	"chip": {"name": "Chip", "food": 15, "bonus": 25, "bonus_name": "Chip bonus", "held_scale": 1.3},
	"pasty": {"name": "Pasty", "food": 30, "bonus": 60, "bonus_name": "Pasty bonus", "held_scale": 0.75},
	"crust": {"name": "Bread crust", "food": 6, "bonus": 0, "held_scale": 1.0},
	"fishhead": {"name": "Mackerel head", "food": 10, "bonus": 0, "held_scale": 0.9},
	"bun": {"name": "Saffron bun", "food": 12, "bonus": 0, "held_scale": 0.8},
	"dispatch": {"name": "Courier's dispatch", "mission": true, "held_scale": 0.55},
	"document": {"name": "Inspection Order", "mission": true, "held_scale": 0.5},
}

var kind := "chip"
var display_name := "Chip"
var is_food := false
var is_mission := false
var food_points := 0
var bonus_points := 0
var bonus_name := ""
var state: int = State.PLACED
var home := Transform3D.IDENTITY
var on_water := false
var source_label := ""
var held_scale := 1.0
var times_dropped := 0

var _vel := Vector3.ZERO
var _follow: Node3D = null
var _spin := 0.0
var _mesh_root: Node3D
var _glint: MeshInstance3D
var _t := 0.0


func setup(k: String) -> Node3D:
	kind = k
	var info: Dictionary = KINDS.get(k, KINDS["crust"])
	display_name = str(info.get("name", k))
	is_mission = bool(info.get("mission", false))
	is_food = not is_mission
	food_points = int(info.get("food", 0))
	bonus_points = int(info.get("bonus", 0))
	bonus_name = str(info.get("bonus_name", ""))
	held_scale = float(info.get("held_scale", 1.0))
	return self


func _ready() -> void:
	_mesh_root = Node3D.new()
	add_child(_mesh_root)
	_build_mesh()
	if home == Transform3D.IDENTITY:
		home = global_transform
	if is_mission:
		_glint = MeshInstance3D.new()
		var s := SphereMesh.new()
		s.radius = 0.05
		s.height = 0.1
		_glint.mesh = s
		_glint.material_override = Pal.unshaded(Color(1, 0.95, 0.6, 0.85))
		_glint.position = Vector3(0, 0.25, 0)
		add_child(_glint)


func _part(mesh: Mesh, mat: Material, pos := Vector3.ZERO, rot := Vector3.ZERO, scl := Vector3.ONE) -> MeshInstance3D:
	var mi := MeshInstance3D.new()
	mi.mesh = mesh
	mi.material_override = mat
	mi.position = pos
	mi.rotation = rot
	mi.scale = scl
	_mesh_root.add_child(mi)
	return mi


func _build_mesh() -> void:
	match kind:
		"chip":
			var b := BoxMesh.new()
			b.size = Vector3(0.11, 0.025, 0.025)
			_part(b, Pal.mat("chip"), Vector3(0, 0.0125, 0), Vector3(0, 0.3, 0.08))
		"pasty":
			var s := SphereMesh.new()
			s.radius = 0.1
			s.height = 0.2
			s.is_hemisphere = true
			_part(s, Pal.mat("pasty"), Vector3.ZERO, Vector3.ZERO, Vector3(1.0, 0.55, 0.62))
			var crimp := BoxMesh.new()
			crimp.size = Vector3(0.19, 0.022, 0.02)
			_part(crimp, Pal.col(Pal.color("pasty").darkened(0.15)), Vector3(0, 0.055, 0))
		"crust":
			var b2 := BoxMesh.new()
			b2.size = Vector3(0.09, 0.03, 0.06)
			_part(b2, Pal.mat("crust"), Vector3(0, 0.015, 0), Vector3(0, 0.5, 0))
		"bun":
			var s2 := SphereMesh.new()
			s2.radius = 0.06
			s2.height = 0.08
			_part(s2, Pal.mat("pasty"), Vector3(0, 0.03, 0))
		"fishhead":
			var c := CylinderMesh.new()
			c.top_radius = 0.0
			c.bottom_radius = 0.04
			c.height = 0.11
			_part(c, Pal.col(Color(0.6, 0.65, 0.7), 0.3), Vector3(0, 0.03, 0), Vector3(0, 0, PI * 0.5))
		"dispatch":
			var env := BoxMesh.new()
			env.size = Vector3(0.24, 0.012, 0.16)
			_part(env, Pal.mat("manila"), Vector3(0, 0.006, 0))
			var seal := CylinderMesh.new()
			seal.top_radius = 0.022
			seal.bottom_radius = 0.022
			seal.height = 0.008
			_part(seal, Pal.mat("wax"), Vector3(0, 0.014, 0))
			var stripe := BoxMesh.new()
			stripe.size = Vector3(0.24, 0.013, 0.02)
			_part(stripe, Pal.mat("soviet_red"), Vector3(0, 0.0065, -0.055))
		"document":
			var folder := BoxMesh.new()
			folder.size = Vector3(0.26, 0.022, 0.19)
			_part(folder, Pal.col(Color(0.36, 0.42, 0.48)), Vector3(0, 0.011, 0))
			var star := BoxMesh.new()
			star.size = Vector3(0.05, 0.024, 0.05)
			_part(star, Pal.mat("soviet_red"), Vector3(0, 0.012, 0), Vector3(0, PI * 0.25, 0))
			var tie := BoxMesh.new()
			tie.size = Vector3(0.012, 0.025, 0.19)
			_part(tie, Pal.mat("canvas"), Vector3(0.08, 0.012, 0))


func is_grabbable() -> bool:
	return state == State.PLACED or state == State.LOOSE


func hold(follow_node: Node3D) -> void:
	state = State.HELD
	_follow = follow_node
	on_water = false
	_vel = Vector3.ZERO
	_mesh_root.scale = Vector3.ONE * held_scale
	if _glint:
		_glint.visible = false


## Drops from the beak (or a guard's hand) and falls to the ground.
func drop(initial_velocity := Vector3.ZERO) -> void:
	state = State.LOOSE
	_follow = null
	_vel = initial_velocity
	_spin = randf_range(-6.0, 6.0)
	times_dropped += 1
	_mesh_root.scale = Vector3.ONE
	if _glint:
		_glint.visible = true


func pick_up_by(hand: Node3D) -> void:
	state = State.CARRIED_BY_GUARD
	_follow = hand
	_mesh_root.scale = Vector3.ONE


func place_home() -> void:
	state = State.PLACED
	_follow = null
	on_water = false
	global_transform = home
	_mesh_root.scale = Vector3.ONE
	if _glint:
		_glint.visible = true


func consume() -> void:
	state = State.CONSUMED
	_follow = null
	visible = false


func deliver_to(pos: Vector3) -> void:
	state = State.DELIVERED
	_follow = null
	global_position = pos
	rotation = Vector3.ZERO
	_mesh_root.scale = Vector3.ONE
	if _glint:
		_glint.visible = false


func _physics_process(delta: float) -> void:
	_t += delta
	match state:
		State.HELD, State.CARRIED_BY_GUARD:
			if _follow != null and is_instance_valid(_follow):
				global_transform = _follow.global_transform
				if state == State.CARRIED_BY_GUARD:
					global_position += Vector3(0, -0.05, 0)
		State.LOOSE:
			if on_water:
				global_position.y = 0.04 + sin(_t * 1.8) * 0.04
				rotation.y += delta * 0.2
				return
			if _vel == Vector3.ZERO:
				return
			_vel.y -= 9.8 * delta
			_vel.x = move_toward(_vel.x, 0.0, 1.5 * delta)
			_vel.z = move_toward(_vel.z, 0.0, 1.5 * delta)
			var from := global_position
			var to := from + _vel * delta
			var space := get_world_3d().direct_space_state
			var q := PhysicsRayQueryParameters3D.create(from + Vector3.UP * 0.05, to, 1 | 16)
			var hit := space.intersect_ray(q)
			if not hit.is_empty():
				var hp: Vector3 = hit["position"]
				global_position = hp + Vector3.UP * 0.02
				var col: Object = hit["collider"]
				if col is CollisionObject3D and ((col as CollisionObject3D).collision_layer & 16) != 0:
					on_water = true
				rotation = Vector3(0, rotation.y, 0)
				_vel = Vector3.ZERO
			else:
				global_position = to
				rotation.y += _spin * delta
				if global_position.y < -5.0:
					global_position.y = 0.04
					on_water = true
					_vel = Vector3.ZERO
	if _glint and _glint.visible:
		_glint.position.y = 0.25 + sin(_t * 3.0) * 0.05
		var cam := get_viewport().get_camera_3d()
		_glint.visible = cam != null and cam.global_position.distance_to(global_position) < 45.0
