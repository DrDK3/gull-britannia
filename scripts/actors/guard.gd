extends Node3D
## An occupation soldier with a readable routine and suspicion.
##
## Suspicion only builds when a gull is *noteworthy* (near what he guards,
## carrying papers, or very close). An ordinary gull on a roof is beneath his
## notice: to them you are just a gull.
##
## States: ROUTINE -> SUSPICIOUS (?) -> ALERT (!) -> SEARCH at last-seen spot ->
## RETURN to routine. Distractions (a poop on his tunic or in his tea) send him
## away for a while. Loose mission items are picked up and put back.

const Pal = preload("res://scripts/world/palette.gd")
const People = preload("res://scripts/actors/people.gd")

signal state_changed(guard: Node3D, new_state: int)

enum S { ROUTINE, SUSPICIOUS, INVESTIGATE, ALERT, SEARCH, RETURN, DISTRACTED, RECOVER }

const STATE_NAMES := ["routine", "suspicious", "investigating", "alert", "searching", "returning", "distracted", "recovering"]
const SUSPICIOUS_AT := 35.0
const ALERT_AT := 100.0

var mission: Node = null
var guard_name := "Private Borovsky"
var style := "soldier"
var routine: Array = []
var routine_text := ""
var area := Rect2(-1000, -1000, 2000, 2000)
var ground_y := 2.0
var view_range := 24.0
var fov_deg := 110.0
var hearing := 3.0
var walk_speed := 1.8
var run_speed := 4.2
var can_throw := true
var lines := {
	"suspicious": ["Hm?", "That gull...", "What are you looking at, bird?", "Shoo. Shoo!"],
	"alert": ["STOY! Halt, bird!", "You! Seagull! Stop!", "Thief! Feathered thief!", "Comrades! A gull!"],
	"search": ["Where did it go?", "Come out, little capitalist.", "I know you are up there."],
	"return": ["Just a gull.", "Gulls. This whole town is gulls.", "Back to post. Nothing to report."],
	"lost": ["...Gone.", "It has the cunning of the bourgeoisie."],
	"theft": ["The dispatch! It's GONE!", "Who took the papers?!"],
	"recover": ["What is this doing on the ground?", "Papers do not walk."],
}

var state: int = S.ROUTINE
var suspicion := 0.0
var noticing := false
var sees_gull := false
var last_seen := Vector3.ZERO
var tagged := false
var guarded_item: Node3D = null
var post_step := 0
var discovered_theft := false
var alarm_timer := 0.0
var spotted_events := 0
var distractions: Dictionary = {}

var body_yaw := 0.0
var head_yaw := 0.0
var head_pitch := 0.0
var anim := "idle"
var moving := false
var running := false

var _step := 0
var _step_timer := 0.0
var _arrived := false
var _not_seen := 0.0
var _search_timer := 0.0
var _search_pos := Vector3.ZERO
var _throw_cd := 0.0
var _swat_cd := 0.0
var _dist_steps: Array = []
var _dist_index := 0
var _dist_timer := 0.0
var _dist_arrived := false
var _dist_kind := ""
var _recover_item: Node3D = null
var _recover_phase := 0
var _check_timer := 0.0
var _phase := 0.0
var _time := 0.0
var _speech_cd := 0.0
var _priming := 1.0
var _decay_hold := 0.0

var parts: Dictionary = {}
var _bubble: Label3D
var _bubble_timer := 0.0
var _cone: MeshInstance3D
var _cone_mat: StandardMaterial3D
var _mug: MeshInstance3D


func _ready() -> void:
	parts = People.build(self, style)
	_bubble = Label3D.new()
	_bubble.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	_bubble.no_depth_test = true
	_bubble.font_size = 44
	_bubble.outline_size = 12
	_bubble.pixel_size = 0.0045
	_bubble.modulate = Color(1, 1, 0.92)
	_bubble.outline_modulate = Color(0.08, 0.06, 0.05)
	_bubble.position = Vector3(0, 2.55, 0)
	_bubble.visible = false
	_bubble.render_priority = 3
	_bubble.outline_render_priority = 2
	add_child(_bubble)
	_build_cone()
	var mug := MeshInstance3D.new()
	var cm := CylinderMesh.new()
	cm.top_radius = 0.05
	cm.bottom_radius = 0.045
	cm.height = 0.1
	mug.mesh = cm
	mug.material_override = Pal.mat("enamel")
	mug.visible = false
	(parts["hand_r"] as Node3D).add_child(mug)
	_mug = mug
	if routine.size() > 0:
		var first: Dictionary = routine[0]
		global_position = Vector3(first["pos"].x, ground_y, first["pos"].z)
		body_yaw = float(first.get("yaw", 0.0))


func _build_cone() -> void:
	_cone = MeshInstance3D.new()
	var im := ImmediateMesh.new()
	var segs := 18
	var half := deg_to_rad(fov_deg * 0.5)
	im.surface_begin(Mesh.PRIMITIVE_TRIANGLES)
	for i in segs:
		var a0 := -half + 2.0 * half * float(i) / segs
		var a1 := -half + 2.0 * half * float(i + 1) / segs
		im.surface_set_color(Color(1, 1, 1, 0.45))
		im.surface_add_vertex(Vector3.ZERO)
		im.surface_set_color(Color(1, 1, 1, 0.04))
		im.surface_add_vertex(Vector3(-sin(a0), 0, -cos(a0)) * view_range)
		im.surface_set_color(Color(1, 1, 1, 0.04))
		im.surface_add_vertex(Vector3(-sin(a1), 0, -cos(a1)) * view_range)
	im.surface_end()
	_cone.mesh = im
	_cone_mat = (Pal.mat("cone") as StandardMaterial3D).duplicate()
	_cone.material_override = _cone_mat
	_cone.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	_cone.position = Vector3(0, 0.08, 0)
	_cone.visible = false
	add_child(_cone)


# --------------------------------------------------------------------------
# Public API
# --------------------------------------------------------------------------

func state_name() -> String:
	return STATE_NAMES[state]


func head_position() -> Vector3:
	return global_position + Vector3(0, 1.75, 0)


func facing() -> Vector3:
	var y := body_yaw + head_yaw
	return Vector3(-sin(y), 0, -cos(y))


func set_tagged(on: bool) -> void:
	tagged = on


func say(text: String, duration := 2.8) -> void:
	_bubble.text = text
	_bubble.visible = true
	_bubble_timer = duration


func say_line(kind: String) -> void:
	if not lines.has(kind):
		return
	var arr: Array = lines[kind]
	say(arr[randi() % arr.size()])


## Called when a poop hits this guard ("uniform") or his tea ("tea").
func on_pooped(kind: String) -> void:
	if state == S.ALERT or (suspicion >= 50.0 and noticing):
		suspicion = ALERT_AT
		last_seen = mission.gull.global_position if mission else global_position
		say("You did that on PURPOSE!")
		_enter(S.ALERT)
		return
	if distractions.has(kind):
		start_distraction(kind)
	else:
		say("Disgusting bird!")
		suspicion = maxf(suspicion, 30.0)


func on_near_miss(splat_pos: Vector3) -> void:
	if state in [S.ROUTINE, S.RETURN]:
		suspicion = maxf(suspicion, SUSPICIOUS_AT + 5.0)
		last_seen = splat_pos + Vector3.UP * 5.0
		say("Hm? ...Birds.")
		_enter(S.SUSPICIOUS)


func start_distraction(kind: String) -> void:
	_dist_steps = distractions[kind]
	_dist_kind = kind
	_dist_index = 0
	_dist_timer = 0.0
	_dist_arrived = false
	suspicion = minf(suspicion, 20.0)
	_enter(S.DISTRACTED)


func is_busy() -> bool:
	if state != S.DISTRACTED or _dist_index >= _dist_steps.size():
		return false
	var st: Dictionary = _dist_steps[_dist_index]
	return bool(st.get("busy", false)) and _dist_arrived


func distraction_kind() -> String:
	return _dist_kind if state == S.DISTRACTED else ""


func current_step() -> Dictionary:
	if routine.is_empty():
		return {}
	return routine[_step]


func step_index() -> int:
	return _step


## Forces the routine to a step (used by tests and mission scripting).
func jump_to_step(i: int) -> void:
	_step = i % routine.size()
	_step_timer = 0.0
	_arrived = false
	var st: Dictionary = routine[_step]
	global_position = Vector3(st["pos"].x, ground_y, st["pos"].z)
	_arrived = true
	body_yaw = float(st.get("yaw", body_yaw))
	_enter(S.ROUTINE)


# --------------------------------------------------------------------------
# Simulation
# --------------------------------------------------------------------------

func _enter(s: int) -> void:
	var prev := state
	state = s
	match s:
		S.SUSPICIOUS:
			_not_seen = 0.0
			if prev in [S.ROUTINE, S.RETURN]:
				say_line("suspicious")
				Sfx.play_at("huh", head_position(), -2.0)
		S.ALERT:
			_not_seen = 0.0
			spotted_events += 1
			say_line("alert")
			Sfx.play_at("whistle", head_position(), 0.0)
			if mission:
				mission.on_guard_alert(self)
		S.SEARCH:
			_search_timer = 9.0
			_search_pos = last_seen
			_priming = 2.0
			suspicion = minf(suspicion, 75.0)
			_decay_hold = 0.0
			say_line("search")
		S.INVESTIGATE:
			_search_timer = 5.0
			_search_pos = last_seen
			suspicion = minf(suspicion, 80.0)
		S.RETURN:
			_arrived = false
			_priming = 1.0
		S.ROUTINE:
			_priming = 1.0
	if prev != s:
		state_changed.emit(self, s)
		if mission:
			mission.on_guard_state(self, prev, s)


func _physics_process(delta: float) -> void:
	if mission == null or not mission.running:
		return
	_time += delta
	_throw_cd = maxf(_throw_cd - delta, 0.0)
	_swat_cd = maxf(_swat_cd - delta, 0.0)
	_speech_cd = maxf(_speech_cd - delta, 0.0)
	alarm_timer = maxf(alarm_timer - delta, 0.0)
	moving = false
	running = false
	_perceive(delta)
	match state:
		S.ROUTINE:
			_do_routine(delta)
			if suspicion >= SUSPICIOUS_AT:
				_enter(S.SUSPICIOUS)
		S.SUSPICIOUS:
			_do_suspicious(delta)
		S.INVESTIGATE:
			_do_investigate(delta)
		S.ALERT:
			_do_alert(delta)
		S.SEARCH:
			_do_search(delta)
		S.RETURN:
			_do_return(delta)
		S.DISTRACTED:
			_do_distracted(delta)
		S.RECOVER:
			_do_recover(delta)
	_check_timer -= delta
	if _check_timer <= 0.0:
		_check_timer = 0.3
		_check_items()


func _perceive(delta: float) -> void:
	var g: Node3D = mission.gull
	sees_gull = false
	noticing = false
	if g == null:
		return
	var eye := head_position()
	var gp: Vector3 = g.eye_position()
	var to := gp - eye
	var dist := to.length()
	var busy := is_busy()
	var senses := false
	if dist < hearing and (g.speed() > 0.6 or g.flapping):
		senses = true
	elif g.flapping and dist < 6.0 and not busy:
		senses = true
	elif not busy:
		var rng := view_range * (1.25 if alarm_timer > 0.0 else 1.0)
		if dist < rng:
			var flat := Vector3(to.x, 0, to.z)
			var hang := rad_to_deg(facing().angle_to(flat)) if flat.length() > 0.05 else 0.0
			var vang := rad_to_deg(atan2(to.y, maxf(flat.length(), 0.01)))
			var up_lim := 30.0 + rad_to_deg(head_pitch)
			if state in [S.ALERT, S.SEARCH, S.INVESTIGATE, S.SUSPICIOUS] or alarm_timer > 0.0:
				up_lim += 40.0
			if anim == "look_up":
				up_lim += 40.0
			if hang < fov_deg * 0.5 and vang < up_lim and vang > -70.0:
				senses = mission.line_of_sight(eye, gp)
	sees_gull = senses
	if not senses:
		return
	var note: float = mission.noteworthiness(self, g, dist)
	if alarm_timer > 0.0 and dist < 18.0:
		note = maxf(note, 0.45)
	if note <= 0.0:
		return
	noticing = true
	last_seen = g.global_position
	var t := lerpf(0.75, 3.4, clampf(dist / view_range, 0.0, 1.0))
	var gain := note * 100.0 / t * _priming
	if busy:
		gain *= 0.3
	suspicion = minf(suspicion + gain * delta, ALERT_AT)
	_decay_hold = 1.2


func _decay(delta: float, rate: float, floor_value := 0.0) -> void:
	if noticing:
		return
	if _decay_hold > 0.0:
		_decay_hold -= delta
		return
	suspicion = maxf(suspicion - rate * delta, floor_value)


func _face_toward(target: Vector3, delta: float, rate := 5.0) -> void:
	var d := target - global_position
	d.y = 0
	if d.length() < 0.05:
		return
	var want := atan2(-d.x, -d.z)
	body_yaw = lerp_angle(body_yaw, want, 1.0 - exp(-rate * delta))


func _face_yaw(want: float, delta: float, rate := 4.0) -> void:
	body_yaw = lerp_angle(body_yaw, want, 1.0 - exp(-rate * delta))


func _move_to(target: Vector3, spd: float, delta: float) -> bool:
	var d := Vector3(target.x - global_position.x, 0, target.z - global_position.z)
	var dist := d.length()
	if dist < 0.2:
		return true
	var step := minf(spd * delta, dist)
	global_position += d / dist * step
	global_position.y = ground_y
	_face_toward(target, delta, 7.0)
	moving = true
	running = spd > walk_speed * 1.3
	_phase += delta * spd * 3.6
	return false


func _do_routine(delta: float) -> void:
	_decay(delta, 12.0)
	if routine.is_empty():
		return
	var st: Dictionary = routine[_step]
	if not _arrived:
		anim = "idle"
		if _move_to(st["pos"], walk_speed, delta):
			_arrived = true
			_step_timer = 0.0
			if st.has("say") and randf() < 0.85:
				say(str(st["say"]))
	else:
		_face_yaw(float(st.get("yaw", body_yaw)), delta)
		anim = str(st.get("anim", "idle"))
		_mug.visible = anim == "sip"
		_step_timer += delta
		if _step_timer >= float(st.get("wait", 3.0)):
			_step = (_step + 1) % routine.size()
			_arrived = false
			_mug.visible = false
	head_pitch = lerpf(head_pitch, 0.0, delta * 3.0)
	head_yaw = lerpf(head_yaw, 0.0, delta * 3.0)


func _do_suspicious(delta: float) -> void:
	anim = "idle"
	_mug.visible = false
	_face_toward(last_seen, delta, 4.0)
	_look_at_point(last_seen, delta)
	if suspicion >= ALERT_AT:
		_enter(S.ALERT)
		return
	if noticing:
		_not_seen = 0.0
		if global_position.distance_to(mission.gull.global_position) < 4.0:
			anim = "shoo"
		return
	_not_seen += delta
	_decay(delta, 9.0)
	if suspicion < 20.0:
		say_line("return")
		_enter(S.RETURN)
	elif _not_seen > 2.2:
		_enter(S.INVESTIGATE)


func _do_investigate(delta: float) -> void:
	_decay(delta, 6.0)
	var target := _clamp_area(_search_pos)
	if _move_to(target, walk_speed * 1.15, delta):
		anim = "look_up"
		_search_timer -= delta
		if _search_timer <= 0.0:
			say_line("return")
			_enter(S.RETURN)
	else:
		anim = "idle"
		head_pitch = lerpf(head_pitch, 0.35, delta * 2.0)
	if suspicion >= ALERT_AT:
		_enter(S.ALERT)


func _do_alert(delta: float) -> void:
	var g: Node3D = mission.gull
	if noticing:
		_not_seen = 0.0
		suspicion = ALERT_AT
	else:
		_not_seen += delta
	var gp: Vector3 = g.global_position
	var dist := global_position.distance_to(gp)
	var flat_dist := Vector2(global_position.x - gp.x, global_position.z - gp.z).length()
	_look_at_point(gp if noticing else last_seen, delta)
	# Chase on foot (within his patrol area).
	var target := _clamp_area(last_seen)
	if flat_dist > 2.2:
		_move_to(target, run_speed, delta)
	else:
		_face_toward(gp, delta, 8.0)
	anim = "point"
	# Swat a gull within reach.
	if dist < 1.9 and _swat_cd <= 0.0 and noticing:
		_swat_cd = 1.6
		anim = "shoo"
		var dir: Vector3 = gp - global_position
		mission.knock_gull(self, dir, 6.5)
	# Throw his cap at a low gull.
	elif can_throw and noticing and _throw_cd <= 0.0 and dist < 14.0 and dist > 2.5 and gp.y - global_position.y < 10.0:
		_throw_cd = 2.8
		anim = "throw"
		Sfx.play_at("throw", head_position(), -2.0)
		mission.spawn_thrown(self, head_position() + Vector3(0, 0.3, 0), g)
	if _not_seen > 2.0:
		say_line("lost")
		_enter(S.SEARCH)


func _do_search(delta: float) -> void:
	_decay(delta, 5.0, 40.0)
	var target := _clamp_area(_search_pos)
	if _move_to(target, walk_speed * 1.3, delta):
		anim = "look_around"
		_search_timer -= delta
	else:
		anim = "idle"
		head_pitch = lerpf(head_pitch, 0.4, delta * 2.0)
	if suspicion >= ALERT_AT:
		_enter(S.ALERT)
		return
	if _search_timer <= 0.0:
		suspicion = minf(suspicion, 45.0)
		say_line("return")
		_enter(S.RETURN)


func _do_return(delta: float) -> void:
	_decay(delta, 10.0)
	anim = "idle"
	head_pitch = lerpf(head_pitch, 0.0, delta * 2.0)
	head_yaw = lerpf(head_yaw, 0.0, delta * 2.0)
	if suspicion >= SUSPICIOUS_AT + 10.0 and noticing:
		_enter(S.SUSPICIOUS)
		return
	if routine.is_empty():
		_enter(S.ROUTINE)
		return
	var st: Dictionary = routine[_step]
	if _move_to(st["pos"], walk_speed, delta):
		_arrived = true
		_step_timer = 0.0
		_enter(S.ROUTINE)


func _do_distracted(delta: float) -> void:
	_decay(delta, 15.0)
	if suspicion >= ALERT_AT:
		_enter(S.ALERT)
		return
	if _dist_index >= _dist_steps.size():
		_enter(S.RETURN)
		return
	var st: Dictionary = _dist_steps[_dist_index]
	if not _dist_arrived:
		anim = str(st.get("walk_anim", "idle"))
		var spd := walk_speed * float(st.get("speed", 1.2))
		if not st.has("pos") or _move_to(st["pos"], spd, delta):
			_dist_arrived = true
			_dist_timer = 0.0
			if st.has("say"):
				say(str(st["say"]), 3.0)
			if st.has("sound"):
				Sfx.play_at(str(st["sound"]), head_position(), -2.0)
	else:
		if st.has("yaw"):
			_face_yaw(float(st["yaw"]), delta)
		anim = str(st.get("anim", "idle"))
		_mug.visible = anim == "sip"
		_dist_timer += delta
		if _dist_timer >= float(st.get("wait", 1.0)):
			_dist_index += 1
			_dist_arrived = false
			_mug.visible = false


func _do_recover(delta: float) -> void:
	_decay(delta, 8.0)
	if _recover_item == null or not is_instance_valid(_recover_item):
		_enter(S.RETURN)
		return
	if _recover_phase == 0:
		if _recover_item.state != _recover_item.State.LOOSE:
			_recover_item = null
			_enter(S.RETURN)
			return
		anim = "idle"
		if _move_to(_recover_item.global_position, walk_speed * 1.4, delta):
			_recover_item.pick_up_by(parts["hand_r"])
			say_line("recover")
			_recover_phase = 1
	else:
		var home: Vector3 = _recover_item.home.origin
		if _move_to(home + (global_position - home).normalized() * 0.9, walk_speed, delta):
			_recover_item.place_home()
			_recover_item = null
			suspicion = maxf(suspicion, 45.0)
			if mission:
				mission.on_item_recovered_by_guard(self)
			_step = post_step
			_arrived = false
			_enter(S.RETURN)
	if suspicion >= ALERT_AT:
		if _recover_item and _recover_phase == 1:
			_recover_item.place_home()
			_recover_item = null
		_enter(S.ALERT)


func _look_at_point(p: Vector3, delta: float) -> void:
	var eye := head_position()
	var to := p - eye
	var flat := Vector2(to.x, to.z).length()
	var want_pitch := clampf(atan2(to.y, maxf(flat, 0.1)), -0.6, 0.9)
	head_pitch = lerpf(head_pitch, want_pitch, 1.0 - exp(-5.0 * delta))
	head_yaw = lerpf(head_yaw, 0.0, delta * 4.0)


func _clamp_area(p: Vector3) -> Vector3:
	return Vector3(clampf(p.x, area.position.x, area.end.x), ground_y, clampf(p.z, area.position.y, area.end.y))


func _check_items() -> void:
	if state in [S.ALERT, S.RECOVER, S.DISTRACTED]:
		return
	var eye := head_position()
	# Loose papers get tidied away.
	for it in mission.items:
		if not is_instance_valid(it) or not it.is_mission or it.state != it.State.LOOSE:
			continue
		if it.on_water:
			continue
		var d: float = eye.distance_to(it.global_position)
		if d > 16.0:
			continue
		var to: Vector3 = it.global_position - eye
		var flat := Vector3(to.x, 0, to.z)
		if flat.length() > 1.5 and rad_to_deg(facing().angle_to(flat)) > fov_deg * 0.5:
			continue
		if not mission.line_of_sight(eye, it.global_position + Vector3.UP * 0.2):
			continue
		_recover_item = it
		_recover_phase = 0
		_enter(S.RECOVER)
		return
	# Has the thing he guards gone missing?
	if guarded_item != null and not discovered_theft and state in [S.ROUTINE, S.RETURN, S.SUSPICIOUS, S.INVESTIGATE]:
		if guarded_item.state != guarded_item.State.PLACED and guarded_item.state != guarded_item.State.CARRIED_BY_GUARD:
			var home: Vector3 = guarded_item.home.origin
			var dh := eye.distance_to(home)
			var to2 := home - eye
			var flat2 := Vector3(to2.x, 0, to2.z)
			if dh < 13.0 and (flat2.length() < 1.5 or rad_to_deg(facing().angle_to(flat2)) < fov_deg * 0.5) and mission.line_of_sight(eye, home + Vector3.UP * 0.3):
				discovered_theft = true
				alarm_timer = 35.0
				say_line("theft")
				Sfx.play_at("whistle", head_position(), 2.0)
				last_seen = home + Vector3.UP * 4.0
				suspicion = maxf(suspicion, 60.0)
				if mission:
					mission.on_theft_discovered(self)
				_enter(S.SEARCH)


func _process(delta: float) -> void:
	if _bubble_timer > 0.0:
		_bubble_timer -= delta
		if _bubble_timer <= 0.0:
			_bubble.visible = false
	People.animate(parts, anim, _phase, moving, running, _time, head_yaw, head_pitch)
	(parts["body"] as Node3D).rotation = Vector3(0, body_yaw, 0)
	# Vision cone (shown once scouted).
	var cam := get_viewport().get_camera_3d()
	var near := cam != null and cam.global_position.distance_to(global_position) < 140.0
	_cone.visible = tagged and near
	if _cone.visible:
		_cone.rotation = Vector3(0, body_yaw + head_yaw, 0)
		var c := Color(1, 1, 1, 0.55)
		match state:
			S.SUSPICIOUS, S.INVESTIGATE:
				c = Color(1.0, 0.85, 0.2, 0.75)
			S.ALERT:
				c = Color(1.0, 0.2, 0.15, 0.85)
			S.SEARCH:
				c = Color(1.0, 0.55, 0.15, 0.8)
			S.DISTRACTED:
				c = Color(0.55, 0.7, 1.0, 0.35)
			S.RECOVER:
				c = Color(1.0, 0.85, 0.2, 0.6)
		_cone_mat.albedo_color = c
