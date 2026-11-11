extends Node3D
## A falling poop. Inherits the gull's momentum, so height, speed and release
## timing decide where it lands. Hits are resolved by the mission.

const Pal = preload("res://scripts/world/palette.gd")
const GRAVITY := 14.0

var mission: Node = null
var velocity := Vector3.ZERO
var release_height := 0.0
var from_flock := false
var _life := 6.0
var _mesh: MeshInstance3D


func _ready() -> void:
	_mesh = MeshInstance3D.new()
	var s := SphereMesh.new()
	s.radius = 0.07
	s.height = 0.14
	s.radial_segments = 8
	s.rings = 4
	_mesh.mesh = s
	_mesh.material_override = Pal.mat("poop")
	_mesh.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(_mesh)


func _physics_process(delta: float) -> void:
	_life -= delta
	if _life <= 0.0:
		queue_free()
		return
	var from := global_position
	var nv := velocity + Vector3.DOWN * GRAVITY * delta
	var to := from + (velocity + nv) * 0.5 * delta
	velocity = nv
	# Targets first (guards, mugs, clipboards), with a forgiving radius.
	var target: Variant = mission.poop_target_on_segment(from, to) if mission else null
	if target != null:
		mission.on_poop_hit(self, target, to)
		queue_free()
		return
	var space := get_world_3d().direct_space_state
	var q := PhysicsRayQueryParameters3D.create(from, to, 1 | 16)
	var hit := space.intersect_ray(q)
	if not hit.is_empty():
		if mission:
			mission.on_poop_splat(self, hit["position"], hit["normal"], hit["collider"])
		queue_free()
		return
	global_position = to
	if velocity.length() > 0.5:
		var look_target := to + velocity
		if absf(velocity.normalized().dot(Vector3.UP)) < 0.98:
			look_at(look_target, Vector3.UP)
		_mesh.scale = Vector3(1, 1, 1.0 + minf(velocity.length() * 0.05, 0.8))
