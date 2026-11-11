extends "res://scripts/missions/mission.gd"
## Mission 1 — A Chip Off the Old Block.
##
## Learn to fly and perch, steal lunch, snatch the harbour courier's dispatch
## from under Private Borovsky's nose in Bayards Cove, and deliver it to the
## lobster pot aboard the Dorothy May in the Boat Float.
##
## Two approaches:
## - Unseen (timing): wait on the Harbour Office gutter or chimney, out of a
##   calm sentry's eyeline, until his routine takes him to the river or the
##   fort. Then drop, snatch and leave over the roofs.
## - Distraction: from the quay lamp or the Brixham Lass's mast, poop on the
##   sentry (he walks to the pump to scrub his tunic) or in his tea (he walks
##   up the lane for a refill). Either way the table is left unwatched.

const Diner = preload("res://scripts/actors/diner.gd")
const D = preload("res://scripts/world/dartmouth.gd")

var sentry: Node3D
var diner: Node3D
var dispatch: Node3D
var pasty: Node3D
var chips: Array = []
var pot: Node3D
var stash: Node3D
var station_perch: Node3D
var gutter_perch: Node3D
var lamp_perch: Node3D
var mug: MeshInstance3D
var mug_target: Dictionary
var _tea_spilled := false
var _hint_timer := 0.0
var _lunch_done := false
var _delivered := false
var _distraction_said := ""


func _setup() -> void:
	mission_id = "m1"
	title = "A Chip Off the Old Block"
	par_time = 300.0
	build_world({"occupation": 1})
	spawn_gull(D.NEST + Vector3(0, 0.35, 0), -PI * 0.55)

	# Perches.
	add_perch(D.NEST, "The Nest", "Resistance stash. Bring food here and press [E].")
	station_perch = add_perch(D.STATION_ROOF, "Station roof", "Bayards Cove lies south. Hold right mouse to scout.")
	add_perch(D.CHURCH_TOWER, "St Saviour's tower", "The whole waterfront at a glance.")
	gutter_perch = add_perch(D.HARBOUR_GUTTER, "Harbour Office gutter", "Right above the dispatch. A calm sentry never looks this high.")
	add_perch(D.HARBOUR_CHIMNEY, "Harbour Office chimney", "Watch his routine from here.")
	lamp_perch = add_perch(D.COVE_LAMP, "Quay lamp", "Clear line to the sentry and his tea.")
	add_perch(D.BRIXHAM_MAST, "Mast of the Brixham Lass", "Out on the water. Nobody looks at a gull on a mast.")
	add_perch(D.FORT_PARAPET, "Fort parapet", "The fort end of his patrol.")

	# Drop points.
	stash = add_drop(D.NEST + Vector3(0, 0.05, 0), "stash", "the nest stash", ["food"], "nest", 1.8)
	pot = add_drop(Vector3(0.6, 0.92, -44.0), "pot", "the lobster pot on the Dorothy May", ["dispatch"], "lobster_pot", 2.6)

	# Food.
	diner = Diner.new()
	add_child(diner)
	diner.global_position = Vector3(33.0, D.QUAY, -24.4)
	var paper := MeshInstance3D.new()
	var pb := BoxMesh.new()
	pb.size = Vector3(0.45, 0.01, 0.4)
	paper.mesh = pb
	paper.material_override = Pal.mat("newsprint")
	add_child(paper)
	paper.global_position = Vector3(33.0, D.QUAY + 0.495, -23.35)
	for i in 4:
		chips.append(add_item("chip", Vector3(32.9 + (i % 2) * 0.12, D.QUAY + 0.515, -23.45 + (i / 2) * 0.14), randf() * TAU, "the clerk's chips"))
	pasty = add_item("pasty", D.BAKERY_SILL + Vector3(0, 0.0, 0), 0.4, "the bakery windowsill")
	add_item("crust", Vector3(-30.0, D.QUAY + 0.02, -44.0), 0.2)
	add_item("crust", Vector3(14.0, D.QUAY + 0.02, -21.0), 1.0)
	add_item("fishhead", Vector3(-15.0, D.QUAY + 0.02, -27.0), 0.5)

	# The dispatch on the courier's table.
	dispatch = add_item("dispatch", D.COVE_TABLE + Vector3(0, 0.82, 0), 0.1, "the courier's table")
	restricted_zones.append({"center": D.COVE_TABLE, "radius": 6.0, "height": 4.5})

	# Private Borovsky.
	sentry = Guard.new()
	sentry.guard_name = "Pte. Borovsky"
	sentry.routine_text = "post · tea · river · fort"
	sentry.ground_y = D.QUAY
	sentry.area = Rect2(5.5, 42.0, 26.0, 66.0)
	sentry.routine = [
		{"pos": D.COVE_POST, "yaw": PI * 0.5, "wait": 8.0, "anim": "idle", "say": "All quiet. As ordered."},
		{"pos": D.COVE_POST + Vector3(0.6, 0, -0.9), "yaw": PI * 0.85, "wait": 4.5, "anim": "sip", "say": "Ahh. Tea."},
		{"pos": D.COVE_RIVER, "yaw": -PI * 0.5, "wait": 9.0, "anim": "idle", "say": "Boats. Water. More boats."},
		{"pos": D.COVE_FORT, "yaw": PI, "wait": 9.0, "anim": "idle", "say": "Beautiful. Like Odessa, but wetter."},
	]
	sentry.post_step = 0
	sentry.distractions = {
		"uniform": [
			{"anim": "outrage", "wait": 2.2, "say": "My tunic! My BEST tunic!"},
			{"pos": D.COVE_PUMP + Vector3(0, 0, -1.4), "speed": 1.5, "yaw": PI, "anim": "scrub", "wait": 11.0, "busy": true, "say": "Scrub. Scrub. Disgraceful bird."},
			{"anim": "idle", "wait": 1.6, "say": "...It is still there. It is STILL THERE."},
		],
		"tea": [
			{"anim": "outrage", "wait": 2.0, "say": "My TEA! It went in my TEA!"},
			{"pos": Vector3(7.5, D.QUAY, 45.5), "speed": 1.45},
			{"pos": D.COVE_KITCHEN + Vector3(1.0, 0, 0.6), "speed": 1.2, "yaw": 0.0, "anim": "idle", "wait": 7.5, "busy": true, "say": "Comrade Cook! More tea. A gull has... never mind."},
			{"anim": "sip", "yaw": 0.0, "wait": 3.0, "busy": true, "say": "Better."},
		],
	}
	add_guard(sentry)
	sentry.guarded_item = dispatch

	# His tea, on the barrel by his post: a small but tempting target.
	mug = MeshInstance3D.new()
	var cm := CylinderMesh.new()
	cm.top_radius = 0.06
	cm.bottom_radius = 0.055
	cm.height = 0.12
	mug.mesh = cm
	mug.material_override = Pal.mat("enamel")
	add_child(mug)
	mug.global_position = D.COVE_BARREL + Vector3(0, 0.96, 0)
	mug_target = add_poop_target(mug, "tea", 0.6, sentry)

	# Objectives.
	add_objective("takeoff", "Take off from the nest [Space]")
	add_objective("perch", "Land on the station roof (hold Ctrl to glide in)", station_perch, false, "hidden")
	add_objective("scout", "Optional: hold right mouse and tag the sentry in Bayards Cove", null, true, "hidden")
	add_objective("lunch", "Lunch: snatch a chip or the pasty, then eat it [F] or stash it at the nest", null, false, "hidden")
	add_objective("dispatch", "Steal the courier's dispatch from the Harbour Office table", dispatch, false, "hidden")
	add_objective("deliver", "Deliver the dispatch to the lobster pot aboard the Dorothy May", pot, false, "hidden")


func _on_start() -> void:
	Sfx.play_music("mission")
	say("Mother", "Morning, Scrumpy. Mother here. You're on the nest. Space to take off when ready.", 6.0)


func _mission_tick(delta: float) -> void:
	_hint_timer += delta
	# Tutorial progression.
	if objective_state("takeoff") == "active" and gull.is_airborne() and gull.time_in_mode > 0.3:
		complete_objective("takeoff")
		set_objective("perch", "active")
		station_perch.highlight = true
		say("Mother", "W to flap, look where you want to go. Shift to dive, S to brake. Now land on the station roof — hold Ctrl near it and the wings will do the rest.", 8.0)
	if objective_state("perch") == "active" and _hint_timer > 40.0 and not has_said("perch_hint"):
		say_once("perch_hint", "Mother", "The station is the low building on the Embankment with the clock turret — follow the marker. Brake with S, or hold Ctrl.", 6.0)
	# The tea mug follows the routine: in hand while sipping, spilled after a hit.
	var sipping: bool = sentry.anim == "sip" and sentry.state == Guard.S.ROUTINE
	mug.visible = not sipping
	mug_target["active"] = not sipping and not _tea_spilled
	if _tea_spilled and sentry.state != Guard.S.DISTRACTED:
		_tea_spilled = false
		mug.rotation = Vector3.ZERO
		mug.global_position = D.COVE_BARREL + Vector3(0, 0.96, 0)
	# Lunch objective target: nearest remaining food.
	if objective_state("lunch") == "active":
		var best: Node3D = null
		var bd := INF
		for it in items:
			if it.is_food and it.is_grabbable() and (it.bonus_points > 0):
				var d: float = gull.global_position.distance_to(it.global_position)
				if d < bd:
					bd = d
					best = it
		var held: Node3D = gull.beak_item
		if held != null and held.is_food:
			set_objective_target("lunch", stash)
		else:
			set_objective_target("lunch", best)
	# Narrate the distraction window once per kind.
	if sentry.state == Guard.S.DISTRACTED:
		var k: String = sentry.distraction_kind()
		if k != _distraction_said:
			_distraction_said = k
			if k == "tea":
				say("Mother", "Ha! Into the tea. He's off up the lane for a refill — the table's unwatched. Go!", 5.0)
			elif k == "uniform":
				say("Mother", "Direct hit. He's gone to scrub his tunic at the pump. The table's yours.", 5.0)
	else:
		_distraction_said = ""
	# The beak-slot dilemma.
	var held2: Node3D = gull.beak_item
	if held2 != null and held2.is_mission and objective_state("lunch") == "active":
		var food := nearest_item(6.0)
		if food != null and food.is_food:
			say_once("dilemma", "Mother", "One beak, Scrumpy. Set the dispatch down if you must — but somewhere he won't find it — or come back for lunch later.", 6.5)
	# Finish when both the dispatch and lunch are done.
	if _delivered and _lunch_done and not completed:
		say("Mother", "Dispatch received and lunch accounted for. Come home, Scrumpy. Splendid work.", 5.0)
		complete_mission(3.0)


func _on_perched(p: Node3D) -> void:
	if p == station_perch and objective_state("perch") == "active":
		complete_objective("perch")
		station_perch.highlight = false
		set_objective("scout", "active")
		set_objective("lunch", "active")
		set_objective("dispatch", "active")
		say("Mother", "Good landing. Bayards Cove is south along the quay. Hold right mouse to scout and tag the sentry, so we can see what he sees.", 7.0)
		get_tree().create_timer(9.0).timeout.connect(func():
			if running:
				say("Mother", "Section G regulations: no operative works on an empty stomach. The clerk on the Embankment has chips. The bakery in the cove has a pasty cooling — tastier, riskier.", 8.0))
	elif p == gutter_perch:
		say_once("gutter", "Mother", "Lovely spot. A calm sentry won't look up this high — but a suspicious one will. Wait for his back.", 5.0)
	elif p == lamp_perch:
		say_once("lamp", "Mother", "From here you can see his tea on the barrel. He is very attached to that tea.", 5.0)


func _on_tagged(g: Node3D) -> void:
	if g == sentry:
		complete_objective("scout")
		say("Mother", "Private Borovsky. Creature of habit: post, tea, river, fort, and round again. Note when his back is turned. Note also: he loves his tea.", 7.0)


func _on_item_grabbed(it: Node3D) -> void:
	if it.kind == "chip":
		diner.react()
	if it == dispatch:
		if objective_state("dispatch") == "active":
			complete_objective("dispatch")
			set_objective("deliver", "active")
			say("Mother", "You have it! Now to the Boat Float — the lobster pot on the Dorothy May. Stay high, stay ordinary.", 6.0)
	if it == pasty:
		say_once("pasty", "Mother", "The pasty! Bold. Eat it with F, or take it home to the nest for the pantry.", 4.5)


func _on_food_secured(_it: Node3D, _how: String) -> void:
	if not _lunch_done:
		_lunch_done = true
		complete_objective("lunch")
		if not _delivered:
			say("Mother", "Morale restored. Now: the dispatch.", 3.5)


func _on_item_delivered(it: Node3D, _dp: Node3D) -> void:
	if it == dispatch:
		_delivered = true
		complete_objective("deliver")
		if not _lunch_done:
			say("Mother", "Dispatch received. Now — lunch. Regulations, I'm afraid.", 5.0)


func _on_target_hit(t: Dictionary, _poop: Node3D) -> void:
	if t["kind"] == "tea":
		_tea_spilled = true
		mug.rotation = Vector3(PI * 0.5, 0, 0)
		mug.global_position = D.COVE_BARREL + Vector3(0.1, 0.93, 0)


## Test helper: skip the flying tutorial (objectives as if perched on the station).
func debug_skip_tutorial() -> void:
	complete_objective("takeoff")
	set_objective("perch", "active")
	_on_perched(station_perch)


func primary_done() -> bool:
	return _delivered


func _result_lines() -> Array:
	var lines: Array = []
	lines.append(["Dispatch delivered to the Dorothy May", 500 if _delivered else 0])
	return lines


func _remarks() -> Array:
	var r: Array = []
	if int(stats["guard_hits"]) > 0:
		r.append("Private Borovsky's tunic has been submitted to the laundry under protest.")
	if stats["theft_discovered"]:
		r.append("The theft was discovered on site. The sentry's report describes 'a large, insolent gull'. Section G considers this accurate.")
	else:
		r.append("The theft went unnoticed at the scene. The sentry's report lists 'nothing unusual, apart from the gulls'.")
	if int(stats["items_set_down"]) > 0:
		r.append("The dispatch was set down in the field on %d occasion(s). This is noted without comment." % int(stats["items_set_down"]))
	return r


func debrief_text() -> String:
	return "DEBRIEF — The dispatch is a resupply manifest for the harbour. One line stands out: berth reserved at Sandquay for 'S-197', a submarine, arriving within the week. The Commandant will review the garrison on the Embankment beforehand, and the berthing orders will be on his lectern. Section G is assembling a flock."
