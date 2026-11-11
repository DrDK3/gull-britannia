extends "res://scripts/missions/mission.gd"
## Mission 2 — The Inspection.
##
## Colonel Grushkov reviews the garrison on the South Embankment. The
## Inspection Order (with the submarine's berthing orders) lies on the lectern
## of the reviewing stand, watched by his adjutant, Lt Voronova.
##
## Scout from the rooftops, signal the Bomber Wing from the Royal Castle Hotel
## roof, lead a mass strike on the formation as it passes the stand, and in the
## chaos take the Order to St Saviour's belfry.
##
## The player flies as Bomber lead: bigger payload, a little heavier to turn.

const D = preload("res://scripts/world/dartmouth.gd")
const Builder = preload("res://scripts/world/builder.gd")
const Marcher = preload("res://scripts/actors/marcher.gd")
const AllyGull = preload("res://scripts/actors/ally_gull.gd")
const Figure = preload("res://scripts/actors/figure.gd")

const BOMBER_PROFILE := {
	"name": "Bomber lead",
	"max_payload": 6,
	"payload_regen": 11.0,
	"turn_rate": 2.6,
	"bank_yaw_rate": 1.45,
	"flap_thrust": 6.1,
	"max_speed": 30.0,
	"poop_cooldown": 0.28,
}

const STAND := Vector3(18.5, D.QUAY, -80.0)
const STAND_TOP := 3.6
const LECTERN := Vector3(20.15, STAND_TOP, -80.0)
const ROOST := Vector3(-50.0, 18.12, -39.2)
const BELFRY := Vector3(-88.0, 28.4, -37.0)
const ROUTE_NORTH := -126.0
const ROUTE_SOUTH := -57.0
const ZONE_NORTH := -94.0
const ZONE_SOUTH := -66.0
const PARADE_X := 28.6
const PARADE_SPEED := 1.3
const HITS_TO_BREAK := 4
const CHAOS_TIME := 32.0

var voronova: Node3D
var sentry_n: Node3D
var sentry_s: Node3D
var grushkov: Node3D
var general: Node3D
var document: Node3D
var belfry: Node3D
var roost_perch: Node3D
var flock: Array = []
var marchers: Array = []
var anchor: Node3D
var march_player: AudioStreamPlayer3D

var _anchor_z := ROUTE_NORTH + 8.0
var _dir := 1.0
var _turn_timer := 0.0
var _hit_times: Array = []
var _chaos_timer := 0.0
var _broken_count := 0
var _flock_out := false
var _release_time := -100.0
var _delivered := false
var _speech_t := 0.0
var _theft_announced := false
var _pass_hits := 0


func _setup() -> void:
	mission_id = "m2"
	title = "The Inspection"
	par_time = 360.0
	build_world({"occupation": 2, "shuttered": true})
	_build_stand()
	spawn_gull(Vector3(-46.75, 14.4, -70.0), -PI * 0.5, BOMBER_PROFILE)

	# Perches.
	add_perch(Vector3(-46.75, 14.0, -70.0), "Butterwalk roof", "The stand is east, past the Boat Float. Hold right mouse to scout.")
	roost_perch = add_perch(ROOST, "Royal Castle Hotel roof", "The Bomber Wing's roost. Press G to signal.")
	add_perch(D.STATION_ROOF, "Station roof", "Close to the parade route.")
	add_perch(Vector3(18.5, STAND_TOP + 3.25, -80.0), "Stand canopy", "Directly over the lectern. Very bold.")
	add_perch(D.CHURCH_TOWER + Vector3(2.2, 0, 2.2), "St Saviour's tower", "The belfry drop.")
	add_perch(Vector3(-8.0, D.QUAY + 4.4, -78.0), "Bandstand roof", "Overlooks the reviewing stand.")

	belfry = add_drop(D.CHURCH_TOWER, "belfry", "St Saviour's belfry", ["document"], "nest", 2.8)

	# The Order on the lectern.
	document = add_item("document", LECTERN + Vector3(0, 1.17, 0), PI * 0.5, "the lectern")
	restricted_zones.append({"center": LECTERN, "radius": 4.5, "height": 4.0})
	# Refreshments for the visiting general (optional snack).
	add_item("bun", STAND + Vector3(-0.8, STAND_TOP - D.QUAY + 0.86, 5.0), 0.0, "the refreshment table")
	add_item("bun", STAND + Vector3(-0.6, STAND_TOP - D.QUAY + 0.86, 5.3), 0.0, "the refreshment table")
	add_item("crust", Vector3(-40.0, D.QUAY + 0.02, -66.0), 0.3)

	# Officers on the stand.
	grushkov = Figure.new()
	grushkov.style = "commandant"
	grushkov.facing_yaw = -PI * 0.5
	add_child(grushkov)
	grushkov.global_position = Vector3(18.4, STAND_TOP, -82.2)
	general = Figure.new()
	general.style = "officer"
	general.facing_yaw = -PI * 0.5
	add_child(general)
	general.global_position = Vector3(18.4, STAND_TOP, -77.6)

	# Lt Voronova at the lectern.
	voronova = Guard.new()
	voronova.guard_name = "Lt Voronova"
	voronova.style = "officer"
	voronova.routine_text = "adjutant · guards the Order"
	voronova.ground_y = STAND_TOP
	voronova.view_range = 28.0
	voronova.fov_deg = 120.0
	voronova.can_throw = false
	voronova.area = Rect2(16.8, -85.6, 3.6, 11.2)
	voronova.routine = [
		{"pos": Vector3(19.2, STAND_TOP, -80.9), "yaw": -PI * 0.5, "wait": 9.0, "anim": "idle"},
		{"pos": Vector3(19.2, STAND_TOP, -80.9), "yaw": -PI * 0.75, "wait": 4.0, "anim": "read"},
		{"pos": Vector3(19.2, STAND_TOP, -80.9), "yaw": -PI * 0.3, "wait": 5.0, "anim": "idle"},
	]
	voronova.lines = {
		"suspicious": ["Comrade gull. I see you.", "Hm. That one is watching us.", "Stay where you are, bird."],
		"alert": ["Guards! That gull!", "Seize it! The gull!", "It is THAT gull!"],
		"search": ["It went over there.", "Search the roofs.", "Find it."],
		"return": ["...Carry on.", "As you were.", "Nothing. For now."],
		"lost": ["Gone again.", "Clever bird."],
		"theft": ["The Order! The ORDER is gone!", "Colonel — the Inspection Order!"],
		"recover": ["Who dropped this?", "Papers belong on the lectern."],
	}
	add_guard(voronova)
	voronova.guarded_item = document

	sentry_n = _stand_sentry("Pte. Kulik", Vector3(21.6, D.QUAY, -88.5), 0.0)
	sentry_s = _stand_sentry("Pte. Osipov", Vector3(21.6, D.QUAY, -71.5), PI)

	# The parade: twelve men, three files, four ranks.
	anchor = Node3D.new()
	anchor.name = "ParadeAnchor"
	add_child(anchor)
	for r in 4:
		for c in 3:
			var mm := Marcher.new()
			mm.slot = Vector3((c - 1) * 1.6, 0, r * 1.8)
			mm.ground_y = D.QUAY
			add_child(mm)
			mm.global_position = Vector3(PARADE_X + (c - 1) * 1.6, D.QUAY, _anchor_z - r * 1.8)
			marchers.append(mm)
			add_poop_target(mm, "soldier", 0.72, mm, Vector3(0, 1.7, 0))
			add_poop_target(mm, "soldier", 0.5, mm, Vector3(0, 1.2, 0))
	march_player = AudioStreamPlayer3D.new()
	march_player.bus = "Music"
	march_player.unit_size = 22.0
	march_player.max_distance = 220.0
	anchor.add_child(march_player)

	# The Bomber Wing, waiting on the hotel roof.
	var names := ["Gristle", "Mrs Wimbush", "Old Nelson", "The Padre"]
	# A tight box matched to the parade's 1.6 m files and 1.8 m ranks: fly
	# along the column and every wingman is over another soldier.
	var slots := [Vector3(-1.6, -0.3, 1.8), Vector3(1.6, -0.3, 1.8), Vector3(-1.6, -0.6, 3.6), Vector3(1.6, -0.6, 3.6)]
	var spots := [Vector3(-50, 18.35, -43.6), Vector3(-50, 18.35, -42.3), Vector3(-50, 18.35, -37.4), Vector3(-50, 18.35, -36.1)]
	for i in 4:
		var a := AllyGull.new()
		a.mission = self
		a.callsign = names[i]
		a.roost = spots[i]
		a.slot = slots[i]
		add_child(a)
		flock.append(a)

	add_objective("scout", "Scout the parade from the rooftops: hold right mouse and tag Lt Voronova at the lectern", Vector3(19.2, STAND_TOP + 1.7, -80.9))
	add_objective("signal", "Signal the Bomber Wing from the Royal Castle Hotel roof [G]", roost_perch, false, "hidden")
	add_objective("strike", "Lead the flock over the formation as it passes the stand — release with Q", anchor, false, "hidden")
	add_objective("document", "Take the Inspection Order from the lectern", document, false, "hidden")
	add_objective("deliver", "Deliver the Order to St Saviour's belfry", belfry, false, "hidden")
	add_objective("bun", "Optional: liberate a saffron bun from the refreshment table", null, true)


func _stand_sentry(n: String, pos: Vector3, yaw: float) -> Node3D:
	var g := Guard.new()
	g.guard_name = n
	g.routine_text = "stand guard"
	g.ground_y = D.QUAY
	g.view_range = 22.0
	g.area = Rect2(21.0, -96.0, 14.0, 32.0)
	g.routine = [
		{"pos": pos, "yaw": yaw, "wait": 7.0, "anim": "idle"},
		{"pos": pos, "yaw": yaw - PI * 0.5, "wait": 4.0, "anim": "idle"},
	]
	add_guard(g)
	return g


func _build_stand() -> void:
	var b := Builder.new(self, "ReviewingStand")
	var x0 := STAND.x - 2.0
	var x1 := STAND.x + 2.0
	b.box("wood", Vector3(STAND.x, (D.QUAY + STAND_TOP) * 0.5, -80.0), Vector3(4.0, STAND_TOP - D.QUAY, 12.0), 0.0, true, "deck")
	b.box("soviet_red", Vector3(x1 + 0.03, D.QUAY + 0.8, -80.0), Vector3(0.05, 1.4, 12.0), 0.0, false)
	for i in 5:
		b.box("wood", Vector3(STAND.x - 1.2, D.QUAY + 0.16 + i * 0.32, -88.0 + i * 0.4), Vector3(1.4, 0.32 * (i + 1), 0.4), 0.0, true)
	# Canopy on four posts.
	for p in [Vector3(x0 + 0.2, 0, -85.8), Vector3(x1 - 0.2, 0, -85.8), Vector3(x0 + 0.2, 0, -74.2), Vector3(x1 - 0.2, 0, -74.2)]:
		b.box("wood", p + Vector3(0, STAND_TOP + 1.5, 0), Vector3(0.16, 3.0, 0.16), 0.0, true)
	b.box("canvas", Vector3(STAND.x, STAND_TOP + 3.08, -80.0), Vector3(4.6, 0.16, 12.6), 0.0, true)
	b.box("soviet_red", Vector3(x1 + 0.3, STAND_TOP + 2.75, -80.0), Vector3(0.05, 0.5, 12.6), 0.0, false)
	# Lectern.
	b.box("wood", LECTERN + Vector3(0, 0.55, 0), Vector3(0.5, 1.1, 0.7), 0.0, true)
	b.box("wood_light", LECTERN + Vector3(0, 1.13, 0), Vector3(0.6, 0.06, 0.8), 0.0, true)
	# Refreshment table.
	b.box("canvas", STAND + Vector3(-0.7, STAND_TOP - D.QUAY + 0.42, 5.1), Vector3(1.0, 0.84, 1.4), 0.0, true)
	b.cylinder("enamel", STAND + Vector3(-0.8, STAND_TOP - D.QUAY + 1.05, 4.6), 0.18, 0.42, 10, false)
	b.commit()
	var w: Node3D = world
	w.sign_label("INSPECTION OF THE DARTMOUTH GARRISON", Vector3(x1 + 0.33, STAND_TOP + 2.75, -80.0), PI * 0.5, 0.42, Color(0.97, 0.9, 0.6))
	w.sign_label("СЛАВА СОВЕТСКОЙ АРМИИ!", Vector3(x1 + 0.06, D.QUAY + 0.8, -80.0), PI * 0.5, 0.45, Color(0.97, 0.9, 0.6))


func signal_hint() -> String:
	return "G  signal the Bomber Wing (from the roost)"


func _on_start() -> void:
	Sfx.play_music("mission")
	say("Mother", "Bomber lead, Mother. You're on the Butterwalk roof. The reviewing stand is east of here, beyond the Boat Float. Scout it first.", 7.0)
	grushkov.say("Magnificent. The finest garrison in Devon.", 3.5)


func _mission_tick(delta: float) -> void:
	_update_parade(delta)
	_update_chaos(delta)
	_speech_t += delta
	if march_player.stream == null and Sfx.is_music_ready("march"):
		march_player.stream = Sfx.music["march"]
		march_player.play()
	# Strike evaluation: enough hits on the formation, close together, in front of the stand.
	var now := elapsed
	while not _hit_times.is_empty() and now - float(_hit_times[0]) > 4.0:
		_hit_times.pop_front()
	if _chaos_timer <= 0.0 and _hit_times.size() >= HITS_TO_BREAK:
		_hit_times.clear()
		if _in_zone():
			_break_formation()
		else:
			_formation_holds(true)
	# The flock breaks off after its pass.
	if _flock_out and now - _release_time > 3.0 and _release_time > 0.0:
		_flock_out = false
		for a in flock:
			a.break_off(anchor.global_position)
		if _chaos_timer <= 0.0:
			if _pass_hits == 0 and objective_state("strike") == "active":
				say("Mother", "The Wing dropped on nothing in particular. They're going home to reload — signal again from the roost, and bring them over the parade.", 6.0)
				set_objective("signal", "active", "Signal the Bomber Wing again from the hotel roof [G]")
			else:
				_formation_holds(false)
	# Lunch-ish optional objective.
	if objective_state("bun") == "active":
		for f in stats["food"]:
			if f["kind"] == "bun":
				complete_objective("bun")
				break
	# Theft discovered: the Commandant loses what composure he had.
	if voronova.discovered_theft and not _theft_announced:
		_theft_announced = true
		grushkov.say("The ORDER! A GULL has the ORDER!", 4.0)
		grushkov.pose("outrage", 6.0, "attention")
	if _delivered and not completed:
		say("Mother", "The Order is in the belfry. The verger sends his compliments. Bring the Wing home, Bomber lead.", 5.0)
		complete_mission(3.0)


func _in_zone() -> bool:
	return _anchor_z > ZONE_NORTH and _anchor_z < ZONE_SOUTH + 6.0


func _update_parade(delta: float) -> void:
	if _chaos_timer > 0.0:
		return
	if _turn_timer > 0.0:
		_turn_timer -= delta
		if _turn_timer <= 0.0:
			_dir = -_dir
	else:
		_anchor_z += _dir * PARADE_SPEED * delta
		if _anchor_z > ROUTE_SOUTH or _anchor_z < ROUTE_NORTH:
			_anchor_z = clampf(_anchor_z, ROUTE_NORTH, ROUTE_SOUTH)
			_turn_timer = 3.0
	var heading := PI if _dir > 0.0 else 0.0
	anchor.global_position = Vector3(PARADE_X, D.QUAY, _anchor_z)
	var basis := Basis(Vector3.UP, heading)
	for mm in marchers:
		mm.target = anchor.global_position + basis * mm.slot
		mm.heading = heading
		if mm.state == Marcher.M.MARCH or mm.state == Marcher.M.HALT:
			mm.state = Marcher.M.HALT if _turn_timer > 0.0 else Marcher.M.MARCH
	# The Commandant salutes as they pass.
	if _in_zone() and grushkov.anim == "attention":
		grushkov.pose("salute", 4.0, "attention")
		general.pose("salute", 3.0, "attention")


func _update_chaos(delta: float) -> void:
	if _chaos_timer <= 0.0:
		return
	_chaos_timer -= delta
	if _speech_t > 4.5:
		_speech_t = 0.0
		var lines := ["WHO AUTHORISED THE GULLS?!", "This will be in my report. MY report!", "Stop them! No — do not shoot, it is a PARADE!", "Marshal, I assure you, this is not typical!", "Somebody fetch a NET!"]
		grushkov.say(lines[randi() % lines.size()], 3.5)
	if _chaos_timer <= 0.0:
		for mm in marchers:
			mm.reform()
		grushkov.pose("attention")
		general.pose("attention")
		grushkov.say("Re-form! RE-FORM! As if nothing happened!", 3.5)
		get_tree().create_timer(6.0).timeout.connect(func():
			for mm in marchers:
				if mm.state == Marcher.M.REFORM:
					mm.state = Marcher.M.MARCH)


func _break_formation() -> void:
	_broken_count += 1
	_chaos_timer = CHAOS_TIME
	banner.emit("FORMATION BROKEN", Color(0.6, 1.0, 0.6), 2.5)
	Sfx.play("laugh", -2.0)
	var area := Rect2(22.5, -124.0, 13.0, 66.0)
	for mm in marchers:
		mm.start_chaos(anchor.global_position, area)
	grushkov.say("WHO AUTHORISED THE GULLS?!", 4.0)
	grushkov.pose("outrage", 6.0, "flail")
	general.pose("cower", 8.0, "attention")
	_speech_t = 0.0
	var c := anchor.global_position
	voronova.distractions["chaos"] = [
		{"pos": Vector3(19.4, STAND_TOP, -84.8), "speed": 1.6, "yaw": -PI * 0.8, "anim": "point", "wait": 13.0, "busy": true, "say": "Back in line! BACK IN LINE!"},
		{"anim": "whistle", "yaw": -PI * 0.7, "wait": 9.0, "busy": true, "say": "Form up! FORM UP!", "sound": "whistle"},
	]
	voronova.start_distraction("chaos")
	for g in [sentry_n, sentry_s]:
		g.distractions["chaos"] = [
			{"pos": c + Vector3(randf_range(-3, 3), 0, randf_range(-4, 4)), "speed": 2.3, "anim": "shoo", "wait": 20.0, "busy": true, "say": "Shoo! SHOO!"},
		]
		g.start_distraction("chaos")
	if objective_state("strike") == "active":
		complete_objective("strike")
		if objective_state("document") == "hidden":
			set_objective("document", "active")
		say("Mother", "The formation's broken! Voronova has left the lectern — take the Order, now!", 6.0)


func _formation_holds(solo: bool) -> void:
	if objective_state("strike") != "active":
		return
	grushkov.say("Steady! Eyes FRONT! It is only birds!", 3.5)
	for g in [voronova, sentry_n, sentry_s]:
		g.alarm_timer = maxf(g.alarm_timer, 15.0)
	if solo:
		say("Mother", "Good hits, but not in front of the stand — the formation held. Time it for when they pass the Commandant.", 5.5)
	else:
		say("Mother", "The formation held. The Wing is going back to reload — signal again from the roost, and drop as they pass the stand.", 6.0)
	if objective_state("signal") == "done":
		set_objective("signal", "active", "Signal the Bomber Wing again from the hotel roof [G]")


## G pressed. Returns true when the flock was signalled.
func _on_signal() -> bool:
	if gull.global_position.distance_to(ROOST) > 26.0:
		toast.emit("The Wing roosts on the Royal Castle Hotel — signal from there", C_WARN)
		Sfx.play("squawk", -2.0)
		return true
	var ready_birds := 0
	for a in flock:
		if a.is_ready():
			ready_birds += 1
	if ready_birds == 0:
		toast.emit("The Wing is still reloading", C_WARN)
		Sfx.play("squawk", -2.0)
		return true
	for a in flock:
		if a.is_ready():
			a.scramble()
	_flock_out = true
	_release_time = -100.0
	Sfx.play("signal", 0.0)
	toast.emit("BOMBER WING: %d gulls on your wing" % ready_birds, C_GOOD)
	if objective_state("signal") != "done":
		complete_objective("signal")
		if objective_state("strike") == "hidden":
			set_objective("strike", "active")
		say("Mother", "The Wing is with you, in a tight box. Fly along the column, not across it, and release as they pass the stand — they drop when you drop.", 7.0)
	return true


func spawn_poop(pos: Vector3, vel: Vector3, from_flock := false) -> Node3D:
	var p: Node3D = super(pos, vel, from_flock)
	if not from_flock and _flock_out:
		if _release_time < 0.0:
			_pass_hits = 0
		_release_time = elapsed
		var i := 0
		for a in flock:
			if a.state == AllyGull.A.FOLLOW:
				a.release(0.05 + i * 0.07)
				i += 1
	return p


func _on_target_hit(t: Dictionary, _poop: Node3D) -> void:
	if t["kind"] == "soldier":
		var mm: Node3D = t["owner"]
		mm.on_hit()
		_hit_times.append(elapsed)
		_pass_hits += 1


func _on_tagged(g: Node3D) -> void:
	if g == voronova and objective_state("scout") == "active":
		complete_objective("scout")
		set_objective("signal", "active")
		say("Mother", "Voronova. She'll not leave that lectern unless something truly dreadful happens to the parade. The Wing is on the hotel roof — signal them with G.", 7.0)


func _on_item_grabbed(it: Node3D) -> void:
	if it == document:
		if objective_state("document") != "done":
			complete_objective("document")
			set_objective("deliver", "active")
			if objective_state("strike") == "active":
				set_objective("strike", "done")
			say("Mother", "You have the Order! St Saviour's tower, Bomber lead — the belfry. Stay over the rooftops.", 6.0)


func _on_item_delivered(it: Node3D, _dp: Node3D) -> void:
	if it == document:
		_delivered = true
		complete_objective("deliver")


func primary_done() -> bool:
	return _delivered


func _result_lines() -> Array:
	var lines: Array = []
	lines.append(["Formation broken before the Marshal", 400 if _broken_count > 0 else 0])
	lines.append(["Inspection Order delivered to the belfry", 500 if _delivered else 0])
	var fh := int(stats["flock_hits"])
	lines.append(["Bomber Wing: %d hits on the parade" % fh, fh * 15])
	return lines


func grade_bands() -> Array:
	return [[1650, "A+", "Distinguished Gull Cross (with Bar)"], [1300, "A", "Exemplary"], [950, "B", "Satisfactory"], [650, "C", "Adequate, with Reservations"], [0, "D", "Under Review"]]


func _remarks() -> Array:
	var r: Array = []
	if _broken_count > 0:
		r.append("The Marshal's greatcoat has been forwarded to Moscow for analysis.")
		r.append("Colonel Grushkov has requested 'anti-gull measures'. Section G is not aware of any that work.")
	if _broken_count > 1:
		r.append("The formation was broken %d times. The Committee notes this exceeds requirements, and approves." % _broken_count)
	if int(stats["flock_hits"]) >= 12:
		r.append("Mrs Wimbush asks that her contribution be recorded. It is so recorded.")
	return r


func debrief_text() -> String:
	return "DEBRIEF — The Inspection Order confirms it: S-197 berths at Sandquay for forty-eight hours of resupply, forward hatch open while stores go aboard. And on Saturday the Kommandatura begins Operation PRIBOI, a sweep of every Resistance hideout along the Dart. Grushkov has doubled the patrols and closed the shops on the Embankment. He has also ordered nets."


# --------------------------------------------------------------------------
# Test helpers
# --------------------------------------------------------------------------

func debug_set_parade(z: float, dir := 1.0) -> void:
	_anchor_z = z
	_dir = dir
	_turn_timer = 0.0
	_update_parade(0.0)
	for mm in marchers:
		mm.global_position = mm.target


func debug_snap_flock() -> void:
	for a in flock:
		if a.state == AllyGull.A.FOLLOW:
			a.global_position = a._slot_position(gull)
			a.velocity = gull.velocity
