extends Node3D
## Base mission: objectives, scoring, the beak slot, poop resolution, guard
## callbacks, scouting/tagging and the performance review. Concrete missions
## override the `_setup`, `_mission_tick` and `_on_*` hooks.

const Gull = preload("res://scripts/player/gull.gd")
const Guard = preload("res://scripts/actors/guard.gd")
const Item = preload("res://scripts/world/beak_item.gd")
const Perch = preload("res://scripts/world/perch.gd")
const DropPoint = preload("res://scripts/world/drop_point.gd")
const Poop = preload("res://scripts/player/poop.gd")
const Thrown = preload("res://scripts/actors/thrown.gd")
const Dartmouth = preload("res://scripts/world/dartmouth.gd")
const Pal = preload("res://scripts/world/palette.gd")

signal finished(results: Dictionary)
signal objectives_changed
signal radio(speaker: String, text: String, duration: float)
signal toast(text: String, color: Color)
signal banner(text: String, color: Color, duration: float)

const C_GOOD := Color(0.55, 0.95, 0.55)
const C_FOOD := Color(1.0, 0.85, 0.35)
const C_WARN := Color(1.0, 0.75, 0.25)
const C_BAD := Color(1.0, 0.35, 0.3)
const C_INFO := Color(0.85, 0.9, 1.0)

const GRAB_RANGE_GROUND := 1.5
const GRAB_RANGE_AIR := 2.6
const PROMPT_RANGE := 4.5

var mission_id := "m0"
var title := "Mission"
var par_time := 300.0
var world: Node3D
var gull: CharacterBody3D
var guards: Array = []
var items: Array = []
var perches: Array = []
var drops: Array = []
var poop_targets: Array = []
var objectives: Array = []
var restricted_zones: Array = []
var bounds := Rect2(-160, -210, 410, 440)
var running := false
var completed := false
var elapsed := 0.0
var tension := 0
var stats := {}
var effects_root: Node3D

var _grab_buffer := 0.0
var _last_set_down: Node3D = null
var _set_down_timer := 0.0
var _eating_item: Node3D = null
var _tag_progress: Dictionary = {}
var _splats: Array = []
var _said: Dictionary = {}
var _finish_timer := -1.0
var _tension_hold := 0.0


func _ready() -> void:
	stats = {
		"food": [], "drops": 0, "hits": 0, "guard_hits": 0, "tea_hits": 0, "target_hits": {},
		"long_drops": 0, "spotted": 0, "tumbles": 0, "knocked": 0, "carrying_seen": false,
		"theft_discovered": false, "clean_escape": true, "items_set_down": 0, "tagged": 0,
		"near_misses": 0, "recovered_by_guard": 0, "flock_hits": 0,
	}
	effects_root = Node3D.new()
	effects_root.name = "Effects"
	add_child(effects_root)
	_setup()
	objectives_changed.emit()


## Called by Main after the HUD is connected.
func start() -> void:
	running = true
	if gull:
		gull.controls_enabled = true
	Sfx.loop("water", true, -17.0)
	_on_start()


# --------------------------------------------------------------------------
# Hooks for concrete missions
# --------------------------------------------------------------------------

func _setup() -> void:
	pass


func _on_start() -> void:
	pass


func _mission_tick(_delta: float) -> void:
	pass


func _on_item_grabbed(_item: Node3D) -> void:
	pass


func _on_item_delivered(_item: Node3D, _drop: Node3D) -> void:
	pass


func _on_food_secured(_item: Node3D, _how: String) -> void:
	pass


func _on_target_hit(_target: Dictionary, _poop: Node3D) -> void:
	pass


func _on_splat(_pos: Vector3) -> void:
	pass


func _on_tagged(_guard: Node3D) -> void:
	pass


func _on_perched(_perch: Node3D) -> void:
	pass


func _on_signal() -> bool:
	return false


func _result_lines() -> Array:
	return []


func _remarks() -> Array:
	return []


## True once the operation's main goal is achieved (gates the stealth,
## escape and time bonuses).
func primary_done() -> bool:
	return completed


func debrief_text() -> String:
	return ""


func grade_bands() -> Array:
	return [[1450, "A+", "Distinguished Gull Cross"], [1150, "A", "Exemplary"], [850, "B", "Satisfactory"], [550, "C", "Adequate, with Reservations"], [0, "D", "Under Review"]]


# --------------------------------------------------------------------------
# Construction helpers
# --------------------------------------------------------------------------

func build_world(options := {}) -> Node3D:
	world = Dartmouth.new()
	world.name = "Dartmouth"
	add_child(world)
	world.build(options)
	return world


func spawn_gull(pos: Vector3, yaw: float, profile := {}) -> CharacterBody3D:
	gull = Gull.new()
	gull.name = "Gull"
	gull.mission = self
	gull.controls_enabled = false
	add_child(gull)
	if not profile.is_empty():
		gull.set_profile(profile)
		gull.payload = int(gull.profile["max_payload"])
	gull.spawn(pos, yaw)
	return gull


func add_perch(pos: Vector3, perch_name: String, hint := "") -> Node3D:
	var p := Perch.new()
	p.perch_name = perch_name
	p.hint = hint
	add_child(p)
	p.global_position = pos
	perches.append(p)
	return p


func add_item(kind: String, pos: Vector3, yaw := 0.0, label := "") -> Node3D:
	var it := Item.new()
	it.setup(kind)
	it.source_label = label
	add_child(it)
	it.global_transform = Transform3D(Basis(Vector3.UP, yaw), pos)
	it.home = it.global_transform
	items.append(it)
	return it


func add_drop(pos: Vector3, id: String, label: String, accepts: Array, style := "lobster_pot", radius := 2.4) -> Node3D:
	var d := DropPoint.new()
	d.point_id = id
	d.label = label
	d.accepts = accepts
	d.style = style
	d.radius = radius
	add_child(d)
	d.global_position = pos
	drops.append(d)
	return d


func add_guard(g: Node3D) -> Node3D:
	g.mission = self
	add_child(g)
	guards.append(g)
	poop_targets.append({"node": g, "offset": Vector3(0, 1.72, 0), "radius": 0.62, "kind": "guard", "owner": g})
	poop_targets.append({"node": g, "offset": Vector3(0, 1.25, 0), "radius": 0.45, "kind": "guard", "owner": g})
	return g


func add_poop_target(node: Node3D, kind: String, radius: float, owner: Node = null, offset := Vector3.ZERO) -> Dictionary:
	var t := {"node": node, "offset": offset, "radius": radius, "kind": kind, "owner": owner}
	poop_targets.append(t)
	return t


# --------------------------------------------------------------------------
# Objectives and messages
# --------------------------------------------------------------------------

func add_objective(id: String, text: String, target: Variant = null, optional := false, state := "active") -> void:
	objectives.append({"id": id, "text": text, "target": target, "optional": optional, "state": state})
	objectives_changed.emit()


func objective(id: String) -> Dictionary:
	for o in objectives:
		if o["id"] == id:
			return o
	return {}


func objective_state(id: String) -> String:
	var o := objective(id)
	return str(o.get("state", ""))


func set_objective(id: String, state: String, text := "") -> void:
	var o := objective(id)
	if o.is_empty():
		return
	o["state"] = state
	if text != "":
		o["text"] = text
	objectives_changed.emit()


func complete_objective(id: String) -> void:
	var o := objective(id)
	if o.is_empty() or o["state"] == "done":
		return
	o["state"] = "done"
	Sfx.play("objective", -3.0)
	toast.emit("✓ " + str(o["text"]).split("[")[0].strip_edges(), C_GOOD)
	objectives_changed.emit()


func set_objective_target(id: String, target: Variant) -> void:
	var o := objective(id)
	if not o.is_empty():
		o["target"] = target


## World position of the first active objective with a target (for the HUD marker).
func current_target() -> Variant:
	for o in objectives:
		if o["state"] == "active" and not o["optional"] and o["target"] != null:
			var t: Variant = o["target"]
			if t is Node3D:
				if is_instance_valid(t):
					return (t as Node3D).global_position
			elif t is Vector3:
				return t
	return null


func say(speaker: String, text: String, duration := 5.0) -> void:
	radio.emit(speaker, text, duration)


## Says a line only once per mission.
func say_once(key: String, speaker: String, text: String, duration := 5.0) -> void:
	if _said.has(key):
		return
	_said[key] = true
	say(speaker, text, duration)


func has_said(key: String) -> bool:
	return _said.has(key)


# --------------------------------------------------------------------------
# Main loop
# --------------------------------------------------------------------------

func _physics_process(delta: float) -> void:
	if not running:
		return
	elapsed += delta
	_set_down_timer = maxf(_set_down_timer - delta, 0.0)
	if _grab_buffer > 0.0:
		_grab_buffer -= delta
		if gull.beak_item == null:
			var it := find_grabbable()
			if it != null:
				_grab(it)
				_grab_buffer = 0.0
	if _eating_item != null and gull.eating_timer <= 0.0:
		_finish_eating()
	_update_tagging(delta)
	_update_tension(delta)
	_mission_tick(delta)
	if _finish_timer > 0.0:
		_finish_timer -= delta
		if _finish_timer <= 0.0:
			_finish()


func _update_tension(delta: float) -> void:
	var t := 0
	for g in guards:
		if g.state == Guard.S.ALERT:
			t = 2
		elif g.state in [Guard.S.SEARCH, Guard.S.SUSPICIOUS, Guard.S.INVESTIGATE] and t < 1:
			t = 1
	if t == 2:
		_tension_hold = 6.0
	else:
		_tension_hold = maxf(_tension_hold - delta, 0.0)
		if _tension_hold > 0.0:
			t = 2
	if t != tension:
		tension = t
		Sfx.play_music("chase" if t == 2 else "mission")


func _update_tagging(delta: float) -> void:
	if not gull.scouting:
		_tag_progress.clear()
		return
	var cam: Camera3D = gull.camera
	var fwd := -cam.global_transform.basis.z
	for g in guards:
		if g.tagged:
			continue
		var to: Vector3 = g.head_position() - cam.global_position
		var dist := to.length()
		if dist > 170.0 or rad_to_deg(fwd.angle_to(to)) > 6.0 + 40.0 / maxf(dist, 1.0):
			_tag_progress.erase(g)
			continue
		if not line_of_sight(cam.global_position, g.head_position()):
			continue
		var p: float = _tag_progress.get(g, 0.0) + delta / 0.45
		_tag_progress[g] = p
		if p >= 1.0:
			g.set_tagged(true)
			stats["tagged"] += 1
			Sfx.play("tag", -2.0)
			toast.emit("TAGGED: " + str(g.guard_name), C_INFO)
			_on_tagged(g)


func tag_progress(g: Node3D) -> float:
	return float(_tag_progress.get(g, 0.0))


# --------------------------------------------------------------------------
# Beak slot
# --------------------------------------------------------------------------

## The item a press of E would take: in range, preferring what is in front
## of the beak, and never the thing you set down a moment ago.
func find_grabbable() -> Node3D:
	var range_ := GRAB_RANGE_AIR if gull.is_airborne() else GRAB_RANGE_GROUND
	var best: Node3D = null
	var best_score := INF
	var p: Vector3 = gull.global_position
	var fwd: Vector3 = gull.flat_dir()
	for it in items:
		if not is_instance_valid(it) or not it.is_grabbable():
			continue
		if it == _last_set_down and _set_down_timer > 0.0:
			continue
		var to: Vector3 = it.global_position - p
		var d := to.length()
		if d > range_:
			continue
		var facing := Vector3(to.x, 0, to.z).normalized().dot(fwd) if Vector2(to.x, to.z).length() > 0.05 else 1.0
		var score := d - facing * 0.6
		if score < best_score:
			best_score = score
			best = it
	return best


func nearest_item(max_dist: float) -> Node3D:
	var best: Node3D = null
	var best_d := max_dist
	for it in items:
		if not is_instance_valid(it) or not it.is_grabbable():
			continue
		var d: float = gull.global_position.distance_to(it.global_position)
		if d < best_d:
			best_d = d
			best = it
	return best


## A drop point that would accept the item from here. Hovering above it
## counts: the gull lets go and the item falls in.
func drop_in_range(item: Node3D, slack := 1.0) -> Node3D:
	var gp: Vector3 = gull.global_position
	for d in drops:
		if not d.accepts_item(item):
			continue
		var dp: Vector3 = d.global_position
		var horiz := Vector2(gp.x - dp.x, gp.z - dp.z).length()
		var dy := gp.y - dp.y
		if horiz < d.radius * slack and dy > -1.5 and dy < (d.radius + 2.5) * slack:
			return d
	return null


func gull_interact() -> void:
	if not running or _eating_item != null:
		return
	var it: Node3D = gull.beak_item
	if it != null:
		var dp := drop_in_range(it)
		if dp != null:
			_deliver(it, dp)
			return
		# Nearly there: don't fumble the goods into the harbour.
		var near := drop_in_range(it, 2.2)
		if near != null and it.is_mission:
			toast.emit("Closer — right over " + str(near.label), C_WARN)
			return
		_put_down(it)
		return
	var g := find_grabbable()
	if g != null:
		_grab(g)
	else:
		_grab_buffer = 0.45


func _grab(it: Node3D) -> void:
	if gull.beak_item != null:
		return
	var was_loose: bool = it.state == Item.State.LOOSE
	it.hold(gull.hold_point)
	gull.beak_item = it
	Sfx.play("grab", -2.0)
	if it.is_food:
		toast.emit("Snatched: " + it.display_name, C_FOOD)
	else:
		toast.emit(("Recovered: " if was_loose else "Got it: ") + it.display_name, C_GOOD)
	_on_item_grabbed(it)


func _put_down(it: Node3D) -> void:
	gull.beak_item = null
	it.drop(gull.velocity * 0.5)
	_last_set_down = it
	_set_down_timer = 1.5
	if it.is_mission:
		stats["items_set_down"] += 1
	Sfx.play("grab", -6.0, 0.8)
	toast.emit("Set down: " + it.display_name, C_INFO)


func _deliver(it: Node3D, dp: Node3D) -> void:
	gull.beak_item = null
	dp.show_deposit(it)
	if it.is_food:
		Sfx.play("gulp", -4.0, 1.3)
		_award_food(it, "stashed")
	else:
		Sfx.play("deliver", -1.0)
		if guard_tension() >= 2:
			stats["clean_escape"] = false
		_on_item_delivered(it, dp)


func gull_eat() -> void:
	if not running or _eating_item != null:
		return
	var it: Node3D = gull.beak_item
	if it == null:
		toast.emit("Nothing in your beak.", C_INFO)
		return
	if it.is_mission:
		say_once("eat_paper_%d" % randi_range(0, 1), "Mother", "Do NOT eat the %s, Scrumpy." % it.display_name.to_lower(), 3.0)
		return
	_eating_item = it
	gull.eating_timer = 0.9
	Sfx.play("gulp", -2.0)


func _finish_eating() -> void:
	var it := _eating_item
	_eating_item = null
	if gull.beak_item == it:
		gull.beak_item = null
	it.consume()
	gull.refill_payload()
	_award_food(it, "eaten")


func _award_food(it: Node3D, how: String) -> void:
	var entry := {"kind": it.kind, "name": it.display_name, "points": it.food_points, "bonus": it.bonus_points, "bonus_name": it.bonus_name, "how": how, "pantry": 0}
	if how == "stashed":
		entry["pantry"] = int(round(it.food_points * 0.5))
	stats["food"].append(entry)
	var txt := "+%d FOOD — %s %s" % [it.food_points, it.display_name, how]
	toast.emit(txt, C_FOOD)
	if it.bonus_points > 0:
		toast.emit("+%d %s!" % [it.bonus_points, it.bonus_name.to_upper()], Color(1.0, 0.95, 0.5))
	if entry["pantry"] > 0:
		toast.emit("+%d RESISTANCE PANTRY" % entry["pantry"], C_FOOD)
	_on_food_secured(it, how)


func food_total() -> int:
	var t := 0
	for f in stats["food"]:
		t += int(f["points"]) + int(f["bonus"]) + int(f["pantry"])
	return t


## Knocked by a guard or a thrown cap: tumble and drop what you carry.
func knock_gull(_by: Node3D, dir: Vector3, strength: float) -> void:
	gull.knock(dir, strength)
	stats["knocked"] += 1
	var it: Node3D = gull.beak_item
	if it != null:
		gull.beak_item = null
		if _eating_item == it:
			_eating_item = null
		it.drop(dir.normalized() * 2.0 + Vector3.UP * 2.0)
		toast.emit("Dropped: " + it.display_name, C_BAD)
		if it.is_mission:
			say("Mother", "You've dropped it! Get it back before he does.", 4.0)


func on_gull_hit_by_thrown(t: Node3D) -> void:
	Sfx.play_at("bonk", gull.global_position, 2.0, 0.8)
	knock_gull(t, t.velocity, 5.0)
	say_once("cap_hit", "Mother", "He threw his cap at you! Low and slow is how they get you — climb away.", 4.5)


func spawn_thrown(guard: Node3D, from: Vector3, target: Node3D) -> void:
	var t := Thrown.new()
	t.mission = self
	t.thrower = guard
	effects_root.add_child(t)
	t.launch(from, target)


# --------------------------------------------------------------------------
# Poop
# --------------------------------------------------------------------------

func spawn_poop(pos: Vector3, vel: Vector3, from_flock := false) -> Node3D:
	var p := Poop.new()
	p.mission = self
	p.velocity = vel
	p.from_flock = from_flock
	effects_root.add_child(p)
	p.global_position = pos
	p.release_height = pos.y
	if not from_flock:
		stats["drops"] += 1
	return p


func target_center(t: Dictionary) -> Vector3:
	var n: Node3D = t["node"]
	return n.global_position + (n.global_transform.basis * t["offset"] if t.get("local", false) else t["offset"])


func poop_target_on_segment(from: Vector3, to: Vector3) -> Variant:
	for t in poop_targets:
		var n: Node3D = t["node"]
		if not is_instance_valid(n) or not n.is_visible_in_tree():
			continue
		if t.has("active") and not bool(t["active"]):
			continue
		var c := target_center(t)
		var cp := Geometry3D.get_closest_point_to_segment(c, from, to)
		if cp.distance_to(c) <= float(t["radius"]):
			return t
	return null


func on_poop_hit(poop: Node3D, target: Variant, pos: Vector3) -> void:
	var t: Dictionary = target
	var kind: String = t["kind"]
	var node: Node3D = t["node"]
	if poop.from_flock:
		stats["flock_hits"] += 1
	else:
		stats["hits"] += 1
		var th: Dictionary = stats["target_hits"]
		th[kind] = int(th.get(kind, 0)) + 1
		var fall: float = poop.release_height - pos.y
		if fall > 15.0:
			stats["long_drops"] += 1
			toast.emit("LONG DROP (%d m)" % int(fall), C_GOOD)
	Sfx.play_at("splat", pos, 2.0, randf_range(0.9, 1.1))
	var attach: Node3D = node
	var owner_node: Variant = t["owner"]
	if owner_node != null and kind in ["guard", "soldier"] and "parts" in owner_node:
		attach = owner_node.parts.get("hat", node)
	_make_splat(pos, Vector3.UP, attach, 0.55)
	match kind:
		"guard":
			if not poop.from_flock:
				stats["guard_hits"] += 1
				toast.emit("DIRECT HIT — " + str(t["owner"].guard_name).to_upper(), C_GOOD)
			t["owner"].on_pooped("uniform")
		"tea":
			if not poop.from_flock:
				stats["tea_hits"] += 1
				toast.emit("TEA COMPROMISED", C_GOOD)
			Sfx.play_at("tea", pos, 0.0)
			if t["owner"] != null:
				t["owner"].on_pooped("tea")
	_on_target_hit(t, poop)


func on_poop_splat(poop: Node3D, pos: Vector3, normal: Vector3, _collider: Object) -> void:
	Sfx.play_at("splat", pos, -4.0, randf_range(0.9, 1.2))
	_make_splat(pos, normal, null, 0.4)
	for g in guards:
		if g.global_position.distance_to(pos) < 3.2:
			if not poop.from_flock:
				stats["near_misses"] += 1
			g.on_near_miss(pos)
	_on_splat(pos)


func _make_splat(pos: Vector3, normal: Vector3, attach: Node3D, size: float) -> void:
	var s := Node3D.new()
	var mat := Pal.mat("poop")
	for i in 4:
		var mi := MeshInstance3D.new()
		var sm := SphereMesh.new()
		var r := size * (0.35 if i == 0 else randf_range(0.12, 0.22))
		sm.radius = r
		sm.height = r * 2.0
		sm.radial_segments = 8
		sm.rings = 4
		mi.mesh = sm
		mi.material_override = mat
		mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		mi.scale = Vector3(1, 0.18, 1)
		if i > 0:
			var a := randf() * TAU
			mi.position = Vector3(cos(a), 0, sin(a)) * size * randf_range(0.3, 0.55)
		s.add_child(mi)
	if attach != null:
		attach.add_child(s)
		s.global_position = attach.global_position + Vector3(randf_range(-0.05, 0.05), 0.1, randf_range(-0.05, 0.05))
		s.scale = Vector3.ONE * 0.6
	else:
		effects_root.add_child(s)
		s.global_position = pos + normal * 0.03
		if absf(normal.dot(Vector3.UP)) < 0.99:
			s.global_transform.basis = Basis(Vector3.UP.cross(normal).normalized(), Vector3.UP.angle_to(normal))
	_splats.append(s)
	if _splats.size() > 60:
		var old: Node3D = _splats.pop_front()
		if is_instance_valid(old):
			old.queue_free()


# --------------------------------------------------------------------------
# Perception rules shared by all guards
# --------------------------------------------------------------------------

func line_of_sight(a: Vector3, b: Vector3) -> bool:
	var space := get_world_3d().direct_space_state
	var q := PhysicsRayQueryParameters3D.create(a, b, 1)
	if gull:
		q.exclude = [gull.get_rid()]
	var hit := space.intersect_ray(q)
	if hit.is_empty():
		return true
	return (hit["position"] as Vector3).distance_to(b) < 0.45


## How interesting the gull is to a guard right now (0 = just a gull).
func noteworthiness(_guard: Node3D, g: Node3D, dist: float) -> float:
	var n := 0.0
	var it: Node3D = g.beak_item
	if it != null and it.is_mission:
		n = 1.4
	var gp: Vector3 = g.global_position
	for z in restricted_zones:
		var c: Vector3 = z["center"]
		if Vector2(gp.x - c.x, gp.z - c.z).length() < float(z["radius"]) and gp.y < c.y + float(z["height"]):
			n = maxf(n, 1.0)
	if dist < 4.5:
		n = maxf(n, 0.8)
	elif dist < 9.0 and g.speed() > 13.0:
		n = maxf(n, 0.5)
	if g.is_perched() and (it == null or not it.is_mission) and dist > 4.5:
		n *= 0.5
	return n


func guard_tension() -> int:
	var t := 0
	for g in guards:
		if g.state == Guard.S.ALERT or g.state == Guard.S.SEARCH:
			t = 2
	return t


# --------------------------------------------------------------------------
# Callbacks from guards and the gull
# --------------------------------------------------------------------------

func on_guard_alert(guard: Node3D) -> void:
	stats["spotted"] += 1
	banner.emit("SPOTTED", C_BAD, 2.0)
	Sfx.play("alert", -4.0)
	var it: Node3D = gull.beak_item
	if it != null and it.is_mission:
		stats["carrying_seen"] = true
		stats["clean_escape"] = false
	if stats["spotted"] == 1:
		say("Mother", "%s has seen you! Break line of sight — over the rooftops — and he'll search where he last saw you." % guard.guard_name, 5.5)


func on_guard_state(guard: Node3D, prev: int, now: int) -> void:
	if prev == Guard.S.ALERT and now == Guard.S.SEARCH:
		banner.emit("LINE OF SIGHT BROKEN", C_WARN, 2.0)
		Sfx.play("lost", -4.0)
		say_once("lost_1", "Mother", "He's lost you. He'll search where he last saw you, then go back to his routine.", 5.0)
	elif prev == Guard.S.SEARCH and now == Guard.S.RETURN:
		toast.emit(str(guard.guard_name) + " gave up the search", C_GOOD)
	elif now == Guard.S.SUSPICIOUS and prev in [Guard.S.ROUTINE, Guard.S.RETURN]:
		banner.emit("SUSPICIOUS", C_WARN, 1.2)


func on_theft_discovered(guard: Node3D) -> void:
	stats["theft_discovered"] = true
	banner.emit("THEFT DISCOVERED", C_WARN, 2.5)
	say("Mother", "%s has noticed it's gone. He'll be jumpy for a while — any gull near him will draw his eye." % guard.guard_name, 5.0)


func on_item_recovered_by_guard(_guard: Node3D) -> void:
	stats["recovered_by_guard"] += 1
	say("Mother", "He's put it back where it was. Regroup, and try again.", 4.0)


func on_gull_landed(_on_water: bool) -> void:
	pass


func on_gull_perched(p: Node3D) -> void:
	if p != null:
		toast.emit("Perched: " + str(p.perch_name), C_INFO)
	_on_perched(p)


func on_gull_took_off() -> void:
	pass


func on_gull_tumbled(impact: float) -> void:
	stats["tumbles"] += 1
	if Game.cmd.has("trace"):
		print("    trace tumble: impact=%.1f at %s t=%.1f" % [impact, str(gull.global_position.snapped(Vector3.ONE * 0.1)), elapsed])
	var it: Node3D = gull.beak_item
	if impact > Gull.DROP_IMPACT and it != null:
		gull.beak_item = null
		if _eating_item == it:
			_eating_item = null
		it.drop(Vector3.UP * 2.0)
		toast.emit("Crashed! Dropped: " + it.display_name, C_BAD)
	elif stats["tumbles"] == 1:
		say("Mother", "Steady. Brake with S before you touch down, or hold Ctrl and let the wings do the work.", 4.5)


func on_payload_empty() -> void:
	toast.emit("Payload empty — eat something to reload", C_WARN)


func on_out_of_bounds() -> void:
	say("Mother", "That's outside the operational area, Scrumpy. Come back to the harbour.", 3.5)


func gull_signal() -> void:
	if not _on_signal():
		Sfx.play("squawk", -2.0, randf_range(0.95, 1.1))


# --------------------------------------------------------------------------
# Perches
# --------------------------------------------------------------------------

func find_perch(from: Vector3, look: Vector3, max_dist: float, max_angle_deg: float) -> Node3D:
	var best: Node3D = null
	var best_score := INF
	for p in perches:
		var to: Vector3 = p.global_position - from
		var d := to.length()
		if d > max_dist or d < 0.2:
			continue
		var ang := rad_to_deg(look.angle_to(to))
		if ang > max_angle_deg:
			continue
		if not line_of_sight(from, p.global_position + Vector3.UP * 0.35):
			continue
		var score := ang + d * 0.8
		if score < best_score:
			best_score = score
			best = p
	return best


func perch_at(pos: Vector3) -> Node3D:
	for p in perches:
		if p.global_position.distance_to(pos) < 1.6:
			return p
	return null


# --------------------------------------------------------------------------
# HUD support
# --------------------------------------------------------------------------

func get_prompt() -> String:
	if gull == null or not running:
		return ""
	if _eating_item != null:
		return "Eating..."
	var it: Node3D = gull.beak_item
	if it != null:
		var dp := drop_in_range(it)
		if dp != null:
			return "[E] %s: %s" % ["Stash" if it.is_food else "Deliver", dp.label]
		var near := nearest_item(PROMPT_RANGE)
		if near != null and near.is_food and it.is_mission:
			return "Beak full — [E] set down the %s to take the %s" % [it.display_name.to_lower(), near.display_name.to_lower()]
		if it.is_food:
			return "[F] Eat %s   [E] Set down   (or stash it at the nest)" % it.display_name.to_lower()
		return "[E] Set down %s" % it.display_name.to_lower()
	var g := find_grabbable()
	if g != null:
		return "[E] Snatch %s" % g.display_name.to_lower()
	var n := nearest_item(PROMPT_RANGE)
	if n != null:
		return "%s nearby — get closer and press [E]" % n.display_name
	if gull.is_perched() and gull.perch.hint != "":
		return "%s — %s" % [gull.perch.perch_name, gull.perch.hint]
	return ""


func live_score() -> int:
	var s := food_total()
	s += int(stats["hits"]) * 40
	return s


# --------------------------------------------------------------------------
# Completion and review
# --------------------------------------------------------------------------

func complete_mission(delay := 2.5) -> void:
	if completed:
		return
	completed = true
	_finish_timer = delay


func _finish() -> void:
	running = false
	gull.controls_enabled = false
	Sfx.stop_loops()
	finished.emit(compute_results())


static func fmt_time(t: float) -> String:
	return "%d:%02d" % [int(t) / 60, int(t) % 60]


func compute_results() -> Dictionary:
	var lines: Array = []
	lines.append_array(_result_lines())
	for f in stats["food"]:
		lines.append(["Food: %s (%s)" % [f["name"], f["how"]], int(f["points"])])
		if int(f["bonus"]) > 0:
			lines.append(["   " + str(f["bonus_name"]), int(f["bonus"])])
		if int(f["pantry"]) > 0:
			lines.append(["   Resistance pantry contribution", int(f["pantry"])])
	var drops_n: int = stats["drops"]
	var hits: int = stats["hits"]
	if drops_n > 0:
		var acc := float(hits) / float(drops_n)
		var pts := hits * 40
		if hits >= 2 and acc >= 0.75:
			pts += 100
		lines.append(["Accuracy: %d of %d drops on target (%d%%)" % [hits, drops_n, int(round(acc * 100.0))], pts])
		if int(stats["long_drops"]) > 0:
			lines.append(["   Long-range drops", int(stats["long_drops"]) * 25])
	var done := primary_done()
	var spotted: int = stats["spotted"]
	if not done:
		lines.append(["Stealth, escape and time bonuses: operation incomplete", 0])
	elif spotted == 0:
		lines.append(["Stealth: never spotted", 300])
	elif spotted == 1:
		lines.append(["Stealth: spotted once", 120])
	else:
		lines.append(["Stealth: spotted %d times" % spotted, 0])
	if done and stats["clean_escape"]:
		lines.append(["Clean escape: never seen with the goods", 200])
	elif done:
		lines.append(["Clean escape: seen with the goods", 0])
	if int(stats["tagged"]) > 0:
		lines.append(["Reconnaissance: %d tagged" % int(stats["tagged"]), 50 * int(stats["tagged"])])
	var tb := 0
	if done and elapsed <= par_time:
		tb = 150
	elif done and elapsed <= par_time * 1.5:
		tb = 75
	if done:
		lines.append(["Time %s (par %s)" % [fmt_time(elapsed), fmt_time(par_time)], tb])
	var total := 0
	for l in lines:
		total += int(l[1])
	var grade := "D"
	var grade_title := "Under Review"
	for band in grade_bands():
		if total >= int(band[0]):
			grade = band[1]
			grade_title = band[2]
			break
	return {
		"mission_id": mission_id, "title": title, "lines": lines, "total": total,
		"grade": grade, "grade_title": grade_title, "remarks": _base_remarks() + _remarks(),
		"time": elapsed, "stats": stats.duplicate(true), "debrief": debrief_text(),
	}


func _base_remarks() -> Array:
	var r: Array = []
	if int(stats["spotted"]) == 0:
		r.append("The operative was at all times indistinguishable from an ordinary gull. The Committee can offer no higher praise.")
	elif int(stats["spotted"]) >= 3:
		r.append("The operative was observed on %d occasions. The Committee reminds all ranks that the 'S' in 'Section G' does not stand for 'Seen'." % int(stats["spotted"]))
	var chips := 0
	var pasties := 0
	for f in stats["food"]:
		if f["kind"] == "chip":
			chips += 1
		elif f["kind"] == "pasty":
			pasties += 1
	if pasties > 0:
		r.append("The pasty was, by all accounts, excellent.")
	if chips >= 3:
		r.append("%d chips were requisitioned. Quartermaster queries whether all were strictly operational." % chips)
	elif chips > 0:
		r.append("One chip was requisitioned in accordance with Standing Order 4 (Morale).")
	if stats["food"].is_empty():
		r.append("No food was secured. The operative is reminded that lunch is not optional.")
	if int(stats["tea_hits"]) > 0:
		r.append("%d mug(s) of tea, Soviet issue, were lost in the course of operations. No regret is recorded." % int(stats["tea_hits"]))
	if int(stats["tumbles"]) >= 3:
		r.append("Landings were described by an observer as 'enthusiastic'. Further practice is recommended.")
	if int(stats["knocked"]) > 0:
		r.append("The operative was struck by enemy headwear %d time(s). A claim for injury will not be entertained." % int(stats["knocked"]))
	return r
