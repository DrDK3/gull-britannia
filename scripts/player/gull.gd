extends CharacterBody3D
## The player gull. First-person flight, perching, walking and swimming.
##
## Flight model (arcade, tuned for feel rather than aerodynamics):
## - The gull flies toward where you look; `fly_dir` turns toward the view
##   with a speed-dependent rate, so heavier profiles feel slower to turn.
## - Pointing down trades height for speed, pointing up trades speed for height.
## - Flapping adds thrust (W) or lift (Space). Shift tucks the wings to dive.
## - S flares the wings: rapid braking with a gentle, parachute-like sink.
## - Below stall speed the gull sinks, but falling rebuilds airspeed, so stalls
##   always recover. Hard impacts cause a tumble, never a death.
## - Hold Ctrl (or C) for landing assist: glide onto a perch in view, or flare
##   and settle onto whatever is below.

const Pal = preload("res://scripts/world/palette.gd")

signal landed(on_water: bool)
signal took_off
signal tumbled(impact: float)

enum Mode { GROUND, AIR, WATER, TUMBLE, SNAP }

const GRAVITY := 9.8
const RADIUS := 0.3
const EYE := 0.14
const LAND_SPEED := 11.0
const WATER_LAND_SPEED := 17.0
const SKIM_IMPACT := 4.0
const TUMBLE_IMPACT := 9.0
const DROP_IMPACT := 15.0
const CEILING := 105.0
const POOP_GRAVITY := 14.0
const LAYER_WORLD := 1
const LAYER_GULL := 2
const LAYER_WATER := 16

const STANDARD_PROFILE := {
	"name": "Standard gull",
	"stall_speed": 7.0,
	"cruise_speed": 13.0,
	"flap_max_speed": 17.5,
	"max_speed": 32.0,
	"flap_thrust": 6.5,
	"flap_lift": 4.2,
	"drag": 0.0045,
	"dive_drag": 0.0016,
	"brake_decel": 10.0,
	"turn_rate": 3.2,
	"bank_yaw_rate": 1.8,
	"max_sink": 8.0,
	"walk_speed": 2.4,
	"takeoff_speed": 7.5,
	"climb_factor": 1.0,
	"max_payload": 3,
	"payload_regen": 20.0,
	"poop_cooldown": 0.35,
}

var profile: Dictionary = STANDARD_PROFILE.duplicate()
var mission: Node = null

var mode: int = Mode.GROUND
var yaw := 0.0
var pitch := 0.0
var air_speed := 0.0
var sink := 0.0
var fly_dir := Vector3.FORWARD
var flapping := false
var braking := false
var diving := false
var landing_assist := false
var scouting := false
var controls_enabled := true
var perch: Node3D = null
var beak_item: Node3D = null
var payload := 3
var eating_timer := 0.0

var bot_input: Dictionary = {}

var _payload_timer := 0.0
var _poop_cooldown := 0.0
var _tumble_timer := 0.0
var _off_floor := 0.0
var _flap_phase := 0.0
var _flap_visual := 0.0
var _walk_phase := 0.0
var _bank := 0.0
var _shake := 0.0
var _dip := 0.0
var _yaw_rate := 0.0
var _prev_yaw := 0.0
var _land_cooldown := 0.0
var _recover_assist := 0.0
var _flap_prev := false
var _snap_from := Vector3.ZERO
var _snap_ctrl := Vector3.ZERO
var _snap_to := Vector3.ZERO
var _snap_t := 0.0
var _snap_dur := 1.0
var _snap_perch: Node3D = null
var _bound_msg_timer := 0.0
var _marker_timer := 0.0
var _fov := 80.0
var time_in_mode := 0.0
var last_impact := 0.0
## True while a poop released now would hit a target (guard, tea, soldier).
var drop_on_target := false

var head: Node3D
var pitch_node: Node3D
var roll_node: Node3D
var camera: Camera3D
var hold_point: Node3D
var _beak: Node3D
var _wing_l: Node3D
var _wing_r: Node3D
var _shadow: MeshInstance3D
var _marker: MeshInstance3D


func _ready() -> void:
	collision_layer = LAYER_GULL
	collision_mask = LAYER_WORLD | LAYER_WATER
	floor_max_angle = deg_to_rad(52.0)
	floor_snap_length = 0.35
	safe_margin = 0.02
	var cs := CollisionShape3D.new()
	var sphere := SphereShape3D.new()
	sphere.radius = RADIUS
	cs.shape = sphere
	add_child(cs)
	_build_rig()
	payload = int(profile["max_payload"])
	_fov = Game.get_f("fov")


func set_profile(p: Dictionary) -> void:
	profile = STANDARD_PROFILE.duplicate()
	for k in p.keys():
		profile[k] = p[k]
	payload = mini(payload, int(profile["max_payload"]))


## Places the gull and points the view.
func spawn(pos: Vector3, look_yaw: float, look_pitch := -0.15) -> void:
	global_position = pos
	yaw = look_yaw
	pitch = look_pitch
	_prev_yaw = yaw
	fly_dir = look_dir()
	velocity = Vector3.ZERO
	air_speed = 0.0
	sink = 0.0
	_set_mode(Mode.GROUND)


# --------------------------------------------------------------------------
# Rig and first-person view model
# --------------------------------------------------------------------------

func _build_rig() -> void:
	head = Node3D.new()
	head.name = "Head"
	head.position = Vector3(0, EYE, 0)
	add_child(head)
	pitch_node = Node3D.new()
	head.add_child(pitch_node)
	roll_node = Node3D.new()
	pitch_node.add_child(roll_node)
	camera = Camera3D.new()
	camera.name = "Camera"
	camera.near = 0.04
	camera.far = 1600.0
	camera.fov = Game.get_f("fov")
	camera.current = true
	roll_node.add_child(camera)

	# Beak: a slender yellow bill entering from the bottom of the view, with
	# the herring gull's red gonys spot on the lower mandible.
	_beak = Node3D.new()
	camera.add_child(_beak)
	_beak.add_child(_bill_part(Vector3(0, -0.24, -0.2), Vector3(0, -0.163, -0.35), 0.034, Pal.mat("beak"), Vector3(1.0, 1.0, 0.6)))
	_beak.add_child(_bill_part(Vector3(0, -0.255, -0.21), Vector3(0, -0.18, -0.33), 0.024, Pal.mat("beak"), Vector3(0.9, 1.0, 0.55)))
	var spot := MeshInstance3D.new()
	var sm := SphereMesh.new()
	sm.radius = 0.0075
	sm.height = 0.015
	spot.mesh = sm
	spot.material_override = Pal.mat("gonys")
	spot.position = Vector3(0, -0.184, -0.315)
	_beak.add_child(spot)

	hold_point = Node3D.new()
	hold_point.name = "HoldPoint"
	hold_point.position = Vector3(0, -0.165, -0.38)
	camera.add_child(hold_point)

	_wing_l = _make_wing(-1.0)
	_wing_r = _make_wing(1.0)

	_shadow = MeshInstance3D.new()
	var disc := CylinderMesh.new()
	disc.top_radius = 0.45
	disc.bottom_radius = 0.45
	disc.height = 0.01
	disc.radial_segments = 16
	_shadow.mesh = disc
	_shadow.material_override = Pal.mat("shadow_blob")
	_shadow.top_level = true
	_shadow.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(_shadow)

	_marker = MeshInstance3D.new()
	var torus := TorusMesh.new()
	torus.inner_radius = 0.55
	torus.outer_radius = 0.75
	torus.rings = 20
	torus.ring_segments = 4
	_marker.mesh = torus
	_marker.scale = Vector3(1, 0.15, 1)
	_marker.material_override = Pal.mat("marker_ring")
	_marker.top_level = true
	_marker.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	_marker.visible = false
	add_child(_marker)


## A cone from `base` to `tip` (used for the mandibles).
func _bill_part(base: Vector3, tip: Vector3, radius: float, mat: Material, scl: Vector3) -> MeshInstance3D:
	var d := tip - base
	var cone := CylinderMesh.new()
	cone.top_radius = 0.0
	cone.bottom_radius = radius
	cone.height = d.length()
	cone.radial_segments = 10
	cone.rings = 1
	var mi := MeshInstance3D.new()
	mi.mesh = cone
	mi.material_override = mat
	mi.position = (base + tip) * 0.5
	mi.rotation = Vector3(atan2(d.z, d.y), 0, 0)
	mi.scale = scl
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	return mi


func _make_wing(side: float) -> Node3D:
	var pivot := Node3D.new()
	pivot.position = Vector3(0.16 * side, -0.32, -0.05)
	camera.add_child(pivot)
	var w := MeshInstance3D.new()
	var bm := BoxMesh.new()
	bm.size = Vector3(0.55, 0.012, 0.16)
	w.mesh = bm
	w.material_override = Pal.mat("gull_grey")
	w.position = Vector3(0.28 * side, 0, 0)
	pivot.add_child(w)
	var tip := MeshInstance3D.new()
	var tm := BoxMesh.new()
	tm.size = Vector3(0.18, 0.013, 0.13)
	tip.mesh = tm
	tip.material_override = Pal.mat("gull_black")
	tip.position = Vector3(0.62 * side, 0, 0.01)
	pivot.add_child(tip)
	var dot := MeshInstance3D.new()
	var dm := BoxMesh.new()
	dm.size = Vector3(0.04, 0.014, 0.04)
	dot.mesh = dm
	dot.material_override = Pal.mat("gull_white")
	dot.position = Vector3(0.66 * side, 0, 0.0)
	pivot.add_child(dot)
	pivot.visible = false
	return pivot


# --------------------------------------------------------------------------
# Input
# --------------------------------------------------------------------------

func _pressed(action: String) -> bool:
	if not controls_enabled:
		return false
	if bot_input.has(action):
		return bool(bot_input[action])
	return Input.is_action_pressed(action)


func _axis(neg: String, pos: String) -> float:
	return (1.0 if _pressed(pos) else 0.0) - (1.0 if _pressed(neg) else 0.0)


func _unhandled_input(event: InputEvent) -> void:
	if not controls_enabled:
		return
	if event is InputEventMouseMotion:
		if Input.mouse_mode == Input.MOUSE_MODE_CAPTURED:
			apply_mouse_look(event.relative)
	elif event.is_action_pressed("interact"):
		action("interact")
	elif event.is_action_pressed("eat"):
		action("eat")
	elif event.is_action_pressed("poop"):
		action("poop")
	elif event.is_action_pressed("signal"):
		action("signal")


## Mouse look with sensitivity and invert-Y applied.
func apply_mouse_look(relative: Vector2) -> void:
	var sens := 0.0022 * Game.get_f("mouse_sensitivity") * (0.45 if scouting else 1.0)
	var inv := -1.0 if Game.get_b("invert_y") else 1.0
	yaw -= relative.x * sens
	pitch = clampf(pitch - relative.y * sens * inv, deg_to_rad(-85.0), deg_to_rad(85.0))


## Discrete actions, shared by real input and the automated test bot.
func action(what: String) -> void:
	if not controls_enabled:
		return
	match what:
		"interact":
			if mission:
				mission.gull_interact()
		"eat":
			if mission:
				mission.gull_eat()
		"signal":
			if mission:
				mission.gull_signal()
		"poop":
			poop()
		"takeoff":
			if mode == Mode.GROUND or mode == Mode.WATER:
				take_off()


func look_dir() -> Vector3:
	return Basis.from_euler(Vector3(pitch, yaw, 0.0)) * Vector3.FORWARD


func flat_dir() -> Vector3:
	return Basis(Vector3.UP, yaw) * Vector3.FORWARD


func eye_position() -> Vector3:
	return global_position + Vector3(0, EYE, 0)


func speed() -> float:
	return velocity.length()


func is_airborne() -> bool:
	return mode == Mode.AIR or mode == Mode.TUMBLE or mode == Mode.SNAP


func is_perched() -> bool:
	return mode == Mode.GROUND and perch != null


func mode_name() -> String:
	match mode:
		Mode.GROUND:
			return "PERCHED" if perch != null else "ON FOOT"
		Mode.WATER:
			return "AFLOAT"
		Mode.TUMBLE:
			return "TUMBLING"
		Mode.SNAP:
			return "LANDING"
		Mode.AIR:
			if braking:
				return "BRAKING"
			if diving:
				return "DIVING"
			if flapping:
				return "FLAPPING"
			if air_speed < float(profile["stall_speed"]):
				return "STALLING"
			return "GLIDING"
	return ""


# --------------------------------------------------------------------------
# Simulation
# --------------------------------------------------------------------------

func _set_mode(m: int) -> void:
	mode = m
	time_in_mode = 0.0
	if m == Mode.GROUND or m == Mode.WATER:
		motion_mode = CharacterBody3D.MOTION_MODE_GROUNDED
		floor_snap_length = 0.35
	else:
		floor_snap_length = 0.0


func _physics_process(delta: float) -> void:
	time_in_mode += delta
	_land_cooldown = maxf(_land_cooldown - delta, 0.0)
	_recover_assist = maxf(_recover_assist - delta, 0.0)
	_poop_cooldown = maxf(_poop_cooldown - delta, 0.0)
	_update_look_keys(delta)
	scouting = _pressed("scout") and mode != Mode.TUMBLE
	match mode:
		Mode.GROUND, Mode.WATER:
			_ground_step(delta)
		Mode.AIR:
			_air_step(delta)
		Mode.TUMBLE:
			_tumble_step(delta)
		Mode.SNAP:
			_snap_step(delta)
	_payload_step(delta)
	_eat_step(delta)
	_bounds_step(delta)
	var dy := wrapf(yaw - _prev_yaw, -PI, PI)
	_yaw_rate = lerpf(_yaw_rate, dy / maxf(delta, 0.0001), 1.0 - exp(-8.0 * delta))
	_prev_yaw = yaw
	_marker_timer -= delta
	if _marker_timer <= 0.0:
		_marker_timer = 0.05
		_update_drop_marker()


func _update_look_keys(delta: float) -> void:
	var lx := _axis("look_left", "look_right")
	var ly := _axis("look_down", "look_up")
	if lx != 0.0 or ly != 0.0:
		var inv := -1.0 if Game.get_b("invert_y") else 1.0
		var rate := 1.9 * (0.45 if scouting else 1.0)
		yaw -= lx * rate * delta
		pitch = clampf(pitch + ly * rate * delta * inv, deg_to_rad(-85.0), deg_to_rad(85.0))


func _ground_step(delta: float) -> void:
	var on_water := mode == Mode.WATER
	var ix := _axis("move_left", "move_right")
	var iz := _axis("move_back", "move_forward")
	var dir := Basis(Vector3.UP, yaw) * Vector3(ix, 0.0, -iz)
	if dir.length() > 1.0:
		dir = dir.normalized()
	var spd: float = float(profile["walk_speed"]) * (0.6 if on_water else 1.0) * (1.6 if _pressed("dive") else 1.0)
	if eating_timer > 0.0:
		spd *= 0.4
	var target := dir * spd
	var accel := 18.0 if is_on_floor() or on_water else 4.0
	velocity.x = move_toward(velocity.x, target.x, accel * delta)
	velocity.z = move_toward(velocity.z, target.z, accel * delta)
	if on_water:
		var bob := sin(Time.get_ticks_msec() * 0.002) * 0.04
		velocity.y = (0.12 + bob - global_position.y) * 6.0
	else:
		velocity.y -= GRAVITY * delta
	move_and_slide()
	if dir.length() > 0.1:
		_walk_phase += delta * (13.0 if not on_water else 6.0)
	if perch != null and global_position.distance_to(perch.global_position) > 1.5:
		perch = null
	if on_water:
		if global_position.y > 0.9:
			_start_fall()
	else:
		if is_on_floor():
			_off_floor = 0.0
			var col := get_last_slide_collision()
			if col != null and _is_water(col.get_collider()):
				_set_mode(Mode.WATER)
		else:
			_off_floor += delta
			if _off_floor > 0.22:
				_start_fall()
				return
	var flap_down := _pressed("flap")
	if flap_down and not _flap_prev and time_in_mode > 0.2:
		_flap_prev = flap_down
		take_off()
		return
	_flap_prev = flap_down


func take_off() -> void:
	var f := flat_dir()
	fly_dir = (f + Vector3.UP * 0.6).normalized()
	air_speed = float(profile["takeoff_speed"])
	sink = -3.2 * float(profile["climb_factor"]) - 0.6
	perch = null
	_land_cooldown = 0.45
	_set_mode(Mode.AIR)
	_flap_phase = 0.0
	Sfx.play("flap", -2.0, randf_range(0.9, 1.1))
	took_off.emit()
	if mission:
		mission.on_gull_took_off()


func _start_fall() -> void:
	var h := Vector3(velocity.x, 0, velocity.z)
	fly_dir = (flat_dir() + Vector3.DOWN * 0.15).normalized()
	air_speed = maxf(h.length(), 4.5)
	sink = 0.5
	perch = null
	_land_cooldown = 0.25
	_set_mode(Mode.AIR)


func _air_step(delta: float) -> void:
	var fwd_in := _pressed("move_forward")
	var lift_in := _pressed("flap")
	_flap_prev = lift_in
	landing_assist = _pressed("land")
	braking = _pressed("move_back") or landing_assist
	diving = _pressed("dive") and not braking
	flapping = (fwd_in or lift_in) and eating_timer <= 0.0
	var turn := _axis("move_left", "move_right")
	yaw -= turn * float(profile["bank_yaw_rate"]) * delta

	# Landing assist: glide onto a perch in view.
	if landing_assist and mission:
		var p: Node3D = mission.find_perch(global_position, look_dir(), 18.0, 42.0)
		if p != null:
			start_snap(p)
			return
	# Gentle low-speed auto-perch: hovering down near a perch settles onto it
	# (not while climbing away with Space).
	if mission and air_speed < 5.0 and _land_cooldown <= 0.0 and not lift_in and (braking or sink > 0.5):
		var near: Node3D = mission.find_perch(global_position, look_dir(), 1.8, 180.0)
		if near != null:
			start_snap(near)
			return

	var look := look_dir()
	if landing_assist:
		look.y = clampf(look.y, -0.45, 0.0)
		look = look.normalized()
	var stall: float = profile["stall_speed"]
	var cruise: float = profile["cruise_speed"]
	var spd_frac := clampf(air_speed / cruise, 0.0, 1.0)
	var rate: float = float(profile["turn_rate"]) * lerpf(2.6, 1.0, spd_frac)
	fly_dir = fly_dir.slerp(look, 1.0 - exp(-rate * delta)).normalized()

	# Energy: height <-> speed.
	var g_along := -fly_dir.y * GRAVITY
	if g_along < 0.0:
		g_along /= maxf(float(profile["climb_factor"]), 0.2)
	elif diving:
		g_along *= 1.4
	air_speed += g_along * delta
	var drag: float = profile["dive_drag"] if diving else profile["drag"]
	air_speed -= drag * air_speed * air_speed * delta
	if braking:
		air_speed = move_toward(air_speed, 2.4, float(profile["brake_decel"]) * delta)
	if flapping and not braking and air_speed < float(profile["flap_max_speed"]):
		air_speed += float(profile["flap_thrust"]) * delta * (1.0 if fwd_in else 0.45)
	var lift_frac := clampf((air_speed - 1.0) / (stall - 1.0), 0.0, 1.0)
	if diving:
		lift_frac *= 0.35
	if not braking:
		# Falling rebuilds airspeed: stalls always recover.
		air_speed += ((1.0 - lift_frac) * 5.0 + maxf(sink, 0.0) * 0.55) * delta
	air_speed = clampf(air_speed, 0.0, float(profile["max_speed"]))

	var target := (1.0 - lift_frac) * float(profile["max_sink"])
	if braking:
		target = minf(target, 2.2)
	if _recover_assist > 0.0:
		target = minf(target, 1.5)
	var climb: float = profile["climb_factor"]
	if lift_in and eating_timer <= 0.0:
		target -= float(profile["flap_lift"]) * climb
	elif fwd_in and eating_timer <= 0.0:
		target -= (1.6 * (1.0 - lift_frac) + 0.4) * climb
	if global_position.y > CEILING:
		target += (global_position.y - CEILING) * 0.5
	sink = move_toward(sink, target, 9.0 * delta)

	velocity = fly_dir * air_speed + Vector3.DOWN * sink
	var pre := velocity
	move_and_slide()
	_air_collisions(pre)

	if flapping:
		var prev_phase := _flap_phase
		_flap_phase += delta * 4.2
		if floorf(_flap_phase) != floorf(prev_phase) or prev_phase == 0.0:
			Sfx.play("flap", -6.0, randf_range(0.9, 1.15))
	else:
		_flap_phase = 0.0


func _is_water(collider: Object) -> bool:
	if collider is CollisionObject3D:
		return ((collider as CollisionObject3D).collision_layer & LAYER_WATER) != 0
	return false


func _air_collisions(pre: Vector3) -> void:
	var count := get_slide_collision_count()
	if count == 0:
		return
	for i in count:
		var c := get_slide_collision(i)
		var n := c.get_normal()
		var into := -pre.dot(n)
		var water := _is_water(c.get_collider())
		var total := pre.length()
		if n.y > 0.6:
			if _land_cooldown > 0.0:
				continue
			var limit := WATER_LAND_SPEED if water else LAND_SPEED
			if total <= limit:
				_land(water)
				return
			if into < SKIM_IMPACT:
				# Fast, shallow contact: skim off and keep flying.
				fly_dir = (fly_dir - n * fly_dir.dot(n) + n * 0.25).normalized()
				air_speed *= 0.85
				sink = minf(sink, 0.0)
				_land_cooldown = 0.2
				Sfx.play("thud", -10.0, 1.3)
				return
			_start_tumble(pre, n, into)
			return
		else:
			if into > TUMBLE_IMPACT:
				_start_tumble(pre, n, into)
				return
			var slid := fly_dir - n * fly_dir.dot(n)
			if slid.length() > 0.05:
				fly_dir = slid.normalized()
			air_speed *= 0.92


func _land(on_water: bool) -> void:
	velocity = Vector3.ZERO
	air_speed = 0.0
	sink = 0.0
	flapping = false
	braking = false
	diving = false
	_set_mode(Mode.WATER if on_water else Mode.GROUND)
	_dip = 0.12
	if on_water:
		Sfx.play("splat", -8.0, 0.7)
	else:
		Sfx.play("thud", -4.0)
	if mission and not on_water:
		perch = mission.perch_at(global_position)
	landed.emit(on_water)
	if mission:
		mission.on_gull_landed(on_water)


func _start_tumble(pre: Vector3, n: Vector3, into: float) -> void:
	last_impact = into
	velocity = pre.bounce(n) * 0.28 + n * 1.2 + Vector3.UP * 1.8
	_tumble_timer = 0.7
	_shake = 1.0
	_set_mode(Mode.TUMBLE)
	Sfx.play("bonk", -2.0, randf_range(0.9, 1.1))
	tumbled.emit(into)
	if mission:
		mission.on_gull_tumbled(into)


## External knock (thrown cap, swat). Drops whatever is in the beak.
func knock(from_dir: Vector3, strength := 6.0) -> void:
	if mode == Mode.SNAP:
		_set_mode(Mode.AIR)
	var d := from_dir.normalized()
	d.y = 0.0
	velocity = d * strength + Vector3.UP * 3.0
	last_impact = strength
	_tumble_timer = 0.8
	_shake = 1.2
	_set_mode(Mode.TUMBLE)
	Sfx.play("bonk", 0.0, 0.8)
	tumbled.emit(strength)


func _tumble_step(delta: float) -> void:
	_tumble_timer -= delta
	velocity.y -= GRAVITY * delta
	velocity.x = move_toward(velocity.x, 0.0, 3.0 * delta)
	velocity.z = move_toward(velocity.z, 0.0, 3.0 * delta)
	move_and_slide()
	var on_ground := false
	for i in get_slide_collision_count():
		var c := get_slide_collision(i)
		if c.get_normal().y > 0.6:
			on_ground = true
			if _is_water(c.get_collider()):
				_tumble_timer = minf(_tumble_timer, 0.0)
	if _tumble_timer <= 0.0:
		if on_ground:
			_land(_is_water(get_last_slide_collision().get_collider()) if get_last_slide_collision() else false)
		else:
			# Recover into a flutter.
			fly_dir = (flat_dir() + Vector3.UP * 0.1).normalized()
			air_speed = 5.0
			sink = 0.5
			_recover_assist = 0.8
			_set_mode(Mode.AIR)


func start_snap(p: Node3D) -> void:
	_snap_perch = p
	_snap_from = global_position
	_snap_to = p.global_position + Vector3.UP * (RADIUS + 0.03)
	var dist := _snap_from.distance_to(_snap_to)
	_snap_ctrl = _snap_from.lerp(_snap_to, 0.5) + Vector3.UP * clampf(dist * 0.12, 0.3, 2.5) + fly_dir * minf(dist * 0.2, 3.0)
	_snap_dur = clampf(dist / 9.0, 0.35, 1.8)
	_snap_t = 0.0
	_set_mode(Mode.SNAP)


func _snap_step(delta: float) -> void:
	_snap_t = minf(_snap_t + delta / _snap_dur, 1.0)
	var t := smoothstep(0.0, 1.0, _snap_t)
	var a := _snap_from.lerp(_snap_ctrl, t)
	var b := _snap_ctrl.lerp(_snap_to, t)
	var p := a.lerp(b, t)
	velocity = (p - global_position) / maxf(delta, 0.0001)
	global_position = p
	if _snap_t >= 1.0:
		global_position = _snap_to
		_land(false)
		perch = _snap_perch
		if mission:
			mission.on_gull_perched(perch)


func _payload_step(delta: float) -> void:
	var maxp: int = profile["max_payload"]
	if payload < maxp:
		_payload_timer += delta
		if _payload_timer >= float(profile["payload_regen"]):
			_payload_timer = 0.0
			payload += 1
	else:
		_payload_timer = 0.0


func refill_payload() -> void:
	payload = int(profile["max_payload"])
	_payload_timer = 0.0


func _eat_step(delta: float) -> void:
	if eating_timer > 0.0:
		eating_timer -= delta


func poop() -> void:
	if _poop_cooldown > 0.0 or mode == Mode.TUMBLE:
		return
	if payload <= 0:
		if mission:
			mission.on_payload_empty()
		return
	payload -= 1
	_poop_cooldown = float(profile["poop_cooldown"])
	var pos := global_position + Vector3(0, -0.25, 0)
	var vel := velocity + Vector3(0, -1.0, 0)
	if mode == Mode.GROUND or mode == Mode.WATER:
		vel = flat_dir() * 0.6 + Vector3(0, -0.5, 0)
	Sfx.play("poop", -4.0, randf_range(0.95, 1.1))
	if mission:
		mission.spawn_poop(pos, vel)


func _bounds_step(delta: float) -> void:
	if mission == null:
		return
	_bound_msg_timer = maxf(_bound_msg_timer - delta, 0.0)
	var b: Rect2 = mission.bounds
	var p := Vector2(global_position.x, global_position.z)
	if b.has_point(p):
		return
	var center := b.get_center()
	var to := center - p
	var target_yaw := atan2(-to.x, -to.y)
	yaw = lerp_angle(yaw, target_yaw, 1.0 - exp(-1.6 * delta))
	if mode == Mode.GROUND or mode == Mode.WATER:
		global_position.x = clampf(global_position.x, b.position.x, b.end.x)
		global_position.z = clampf(global_position.z, b.position.y, b.end.y)
	if _bound_msg_timer <= 0.0:
		_bound_msg_timer = 12.0
		mission.on_out_of_bounds()


# --------------------------------------------------------------------------
# Presentation
# --------------------------------------------------------------------------

func _process(delta: float) -> void:
	var reduced := Game.get_b("reduced_motion")
	head.rotation = Vector3(0, yaw, 0)
	pitch_node.rotation = Vector3(pitch, 0, 0)
	# Bank with turning (camera roll).
	var bank_target := 0.0
	if mode == Mode.AIR or mode == Mode.SNAP:
		bank_target = clampf(-_yaw_rate * 0.11 - _axis("move_left", "move_right") * 0.12, -0.38, 0.38)
	if mode == Mode.TUMBLE and not reduced:
		bank_target = sin(_tumble_timer * 14.0) * 0.6
	if reduced:
		bank_target = 0.0
	_bank = lerpf(_bank, bank_target, 1.0 - exp(-6.0 * delta))
	roll_node.rotation = Vector3(0, 0, _bank)
	# Head bob, flap bob, landing dip, shake.
	var off := Vector3.ZERO
	if not reduced:
		if mode == Mode.GROUND or mode == Mode.WATER:
			var moving := Vector2(velocity.x, velocity.z).length() > 0.3
			if moving:
				off.y += sin(_walk_phase) * 0.03
				off.x += sin(_walk_phase * 0.5) * 0.025
		if mode == Mode.AIR and flapping:
			off.y += sin(_flap_phase * TAU) * 0.025
		off.y -= _dip
		if _shake > 0.0:
			off += Vector3(randf_range(-1, 1), randf_range(-1, 1), 0) * _shake * 0.05
	_dip = move_toward(_dip, 0.0, delta * 0.5)
	_shake = move_toward(_shake, 0.0, delta * 2.0)
	camera.position = off
	# Field of view: speed kick and scouting zoom.
	var base: float = Game.get_f("fov")
	var kick := clampf((velocity.length() - 12.0) / 20.0, 0.0, 1.0) * (3.0 if reduced else 11.0)
	var want := base + kick
	if scouting:
		want = 30.0
	_fov = lerpf(_fov, want, 1.0 - exp(-7.0 * delta))
	camera.fov = _fov
	_update_wings(delta, reduced)
	_update_shadow()
	_beak.visible = not scouting
	# Wind in your ears.
	var spd := velocity.length() if is_airborne() else 0.0
	var wind_db := lerpf(-34.0, -8.0, clampf(spd / 30.0, 0.0, 1.0))
	Sfx.loop("wind", is_airborne() and controls_enabled, wind_db, 0.8 + spd / 60.0)


func _update_wings(delta: float, reduced: bool) -> void:
	var show := (mode == Mode.AIR and (flapping or braking)) or mode == Mode.TUMBLE or (mode == Mode.SNAP and _snap_t > 0.6)
	var target := 1.0 if show else 0.0
	_flap_visual = move_toward(_flap_visual, target, delta * 5.0)
	var vis := _flap_visual > 0.02 and not scouting
	_wing_l.visible = vis
	_wing_r.visible = vis
	if not vis:
		return
	var stroke := 0.0
	if mode == Mode.AIR and flapping:
		stroke = sin(_flap_phase * TAU)
	elif mode == Mode.TUMBLE:
		stroke = sin(Time.get_ticks_msec() * 0.03)
	elif braking or mode == Mode.SNAP:
		stroke = 0.6
	if reduced:
		stroke *= 0.4
	var lift := (1.0 - _flap_visual) * -0.25
	var ang := 0.35 + stroke * 0.45
	_wing_l.rotation = Vector3(0.2, 0, ang)
	_wing_r.rotation = Vector3(0.2, 0, -ang)
	_wing_l.position.y = -0.32 + lift
	_wing_r.position.y = -0.32 + lift


func _update_shadow() -> void:
	var space := get_world_3d().direct_space_state
	var from := global_position
	var q := PhysicsRayQueryParameters3D.create(from, from + Vector3.DOWN * 90.0, LAYER_WORLD | LAYER_WATER, [get_rid()])
	var hit := space.intersect_ray(q)
	if hit.is_empty():
		_shadow.visible = false
		return
	var h: float = from.y - (hit["position"] as Vector3).y
	_shadow.visible = h > 0.4
	var n: Vector3 = hit["normal"]
	var basis := Basis()
	if absf(n.dot(Vector3.UP)) < 0.999:
		var axis := Vector3.UP.cross(n).normalized()
		basis = Basis(axis, Vector3.UP.angle_to(n))
	var s := clampf(0.55 + h * 0.012, 0.55, 1.4)
	_shadow.global_transform = Transform3D(basis.scaled(Vector3(s, 1, s)), (hit["position"] as Vector3) + n * 0.04)


func _update_drop_marker() -> void:
	drop_on_target = false
	var show := mode == Mode.AIR and payload > 0 and controls_enabled
	if not show:
		_marker.visible = false
		return
	var space := get_world_3d().direct_space_state
	var p := global_position + Vector3(0, -0.25, 0)
	var v := velocity + Vector3(0, -1.0, 0)
	var dt := 0.06
	for i in 70:
		var nv := v + Vector3.DOWN * POOP_GRAVITY * dt
		var np := p + (v + nv) * 0.5 * dt
		if mission != null:
			var tgt: Variant = mission.poop_target_on_segment(p, np)
			if tgt != null:
				drop_on_target = true
				_marker.visible = Game.get_b("drop_marker")
				_marker.material_override = Pal.mat("marker_hit")
				_marker.global_transform = Transform3D(Basis().scaled(Vector3(0.7, 0.15, 0.7)), mission.target_center(tgt) + Vector3.UP * 0.25)
				return
		var q := PhysicsRayQueryParameters3D.create(p, np, LAYER_WORLD | LAYER_WATER, [get_rid()])
		var hit := space.intersect_ray(q)
		if not hit.is_empty():
			var hp: Vector3 = hit["position"]
			var fall := global_position.y - hp.y
			_marker.visible = fall > 1.5 and Game.get_b("drop_marker")
			_marker.material_override = Pal.mat("marker_ring")
			var s := clampf(0.5 + fall * 0.02, 0.5, 1.6)
			_marker.global_transform = Transform3D(Basis().scaled(Vector3(s, 0.15, s)), hp + Vector3.UP * 0.06)
			return
		p = np
		v = nv
	_marker.visible = false


## Where a poop released now would land (for tests and tutorials).
func predicted_impact() -> Vector3:
	return _marker.global_position if _marker.visible else Vector3.INF
