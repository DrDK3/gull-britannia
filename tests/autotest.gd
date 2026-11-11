extends Node
## Automated checks. Drives the real game systems (flight model, guard AI,
## beak slot, scoring, restart) through scripted scenarios.
##
## Run headless (logic only):
##   godot --headless --path . --fixed-fps 60 -- --autotest=all --fresh-progress --no-music
## Run under a display to also save screenshots:
##   godot --path . --fixed-fps 60 -- --autotest=all --shots=/tmp/shots --fresh-progress
## Pick suites with --autotest=flight,m1_unseen,... (comma separated).

const Guard = preload("res://scripts/actors/guard.gd")
const Item = preload("res://scripts/world/beak_item.gd")
const D = preload("res://scripts/world/dartmouth.gd")

var main: Node
var passed := 0
var failed := 0
var failures: Array = []
var shots_dir := ""
var _suites: Array = []


func _ready() -> void:
	shots_dir = str(Game.cmd.get("shots", ""))
	if shots_dir != "":
		DirAccess.make_dir_recursive_absolute(shots_dir)
	var which := str(Game.cmd.get("autotest", "all"))
	_suites = ["boot", "flight", "perch", "food", "m1_unseen", "m1_distraction", "m1_tea", "m1_spotted", "restart", "settings", "pilot_unseen", "pilot_distraction"] if which == "all" or which == "true" else Array(which.split(","))
	if Game.mission_info("m2").get("playable", false) and (which == "all" or which == "true"):
		_suites.append("m2")
	call_deferred("_run")


func _run() -> void:
	var t0 := Time.get_ticks_msec()
	for s in _suites:
		print("\n=== SUITE: %s ===" % s)
		await call("suite_" + s)
	print("\n=== RESULT: %d passed, %d failed (%.1f s) ===" % [passed, failed, (Time.get_ticks_msec() - t0) / 1000.0])
	for f in failures:
		print("  FAILED: " + f)
	get_tree().quit(0 if failed == 0 else 1)


# --------------------------------------------------------------------------
# Helpers
# --------------------------------------------------------------------------

func check(name: String, cond: bool, detail := "") -> bool:
	if cond:
		passed += 1
		print("  PASS  " + name + ("  (" + detail + ")" if detail != "" else ""))
	else:
		failed += 1
		failures.append(name + ("  (" + detail + ")" if detail != "" else ""))
		print("  FAIL  " + name + ("  (" + detail + ")" if detail != "" else ""))
	return cond


func frames(n: int) -> void:
	for i in n:
		await get_tree().physics_frame


func seconds(s: float) -> void:
	await frames(int(s * 60.0))


func wait_until(cond: Callable, timeout_s: float) -> bool:
	var n := int(timeout_s * 60.0)
	for i in n:
		if cond.call():
			return true
		await get_tree().physics_frame
	return bool(cond.call())


func shot(name: String) -> void:
	if shots_dir == "" or DisplayServer.get_name() == "headless":
		return
	await RenderingServer.frame_post_draw
	var img := get_viewport().get_texture().get_image()
	img.save_png(shots_dir.path_join(name + ".png"))
	print("  shot: " + name)


func launch(id := "m1") -> Node:
	main.launch(id)
	await frames(5)
	return main.mission


func m() -> Node:
	return main.mission


func gull() -> Node:
	return main.mission.gull


func teleport(pos: Vector3, mode := 0, yaw := 0.0, pitch := 0.0) -> void:
	var g := gull()
	g.bot_input = {}
	g.global_position = pos
	g.velocity = Vector3.ZERO
	g.air_speed = 0.0
	g.sink = 0.0
	g.yaw = yaw
	g.pitch = pitch
	g.fly_dir = g.look_dir()
	g._set_mode(mode)
	g.perch = null


func look_at_point(target: Vector3) -> void:
	var g := gull()
	var d: Vector3 = target - g.eye_position()
	g.yaw = atan2(-d.x, -d.z)
	g.pitch = atan2(d.y, Vector2(d.x, d.z).length())
	g.fly_dir = g.look_dir()


func press(action: String, hold_frames := 2) -> void:
	gull().bot_input[action] = true
	await frames(hold_frames)
	gull().bot_input.erase(action)


func sentry() -> Node:
	return m().sentry


# --------------------------------------------------------------------------
# Suites
# --------------------------------------------------------------------------

func suite_boot() -> void:
	var mi := await launch("m1")
	check("mission launches with no manual setup", mi != null and mi.running)
	check("gull spawned on the nest", gull() != null and gull().global_position.distance_to(D.NEST) < 1.5, str(gull().global_position))
	await frames(30)
	check("gull is standing on the nest chimney", gull().mode == 0 and gull().global_position.y > 14.5, "y=%.2f mode=%d" % [gull().global_position.y, gull().mode])
	check("first objective is take off", mi.objective_state("takeoff") == "active")
	check("sentry is on his routine", sentry().state == Guard.S.ROUTINE)
	check("dispatch is on the table", m().dispatch.state == Item.State.PLACED)
	check("HUD exists", main.hud != null)
	await shot("01_nest_start")


func suite_flight() -> void:
	await launch("m1")
	await frames(20)
	var g := gull()
	var y0: float = g.global_position.y
	g.bot_input = {"flap": true}
	var took := await wait_until(func(): return g.mode == 1, 1.0)
	check("Space takes off from a perch", took, "mode=%d" % g.mode)
	await seconds(1.0)
	check("holding Space climbs", g.global_position.y > y0 + 1.5, "dy=%.2f" % (g.global_position.y - y0))
	check("takeoff completes the objective", m().objective_state("takeoff") == "done")
	await shot("02_takeoff")
	# Flap forward along the river at altitude.
	teleport(Vector3(60, 30, -20), 1, PI, 0.0)
	g.air_speed = 10.0
	g.bot_input = {"move_forward": true}
	await seconds(3.0)
	var spd_flap: float = g.air_speed
	check("W flapping builds speed", spd_flap > 14.0, "air_speed=%.1f" % spd_flap)
	g.bot_input = {}
	var yb: float = g.global_position.y
	await seconds(3.0)
	check("level glide holds height (no instant stall)", absf(g.global_position.y - yb) < 4.0 and g.air_speed > 7.0, "dy=%.2f spd=%.1f" % [g.global_position.y - yb, g.air_speed])
	# Dive.
	g.pitch = deg_to_rad(-45)
	g.bot_input = {"dive": true}
	await seconds(1.5)
	check("Shift + look down dives fast", g.air_speed > 20.0, "air_speed=%.1f" % g.air_speed)
	# Stall and recover.
	teleport(Vector3(60, 60, -20), 1, PI, deg_to_rad(70))
	g.air_speed = 6.0
	g.bot_input = {}
	await seconds(2.0)
	g.pitch = 0.0
	await seconds(2.5)
	check("a stall always recovers to flight", g.mode == 1 and g.air_speed > 6.0 and g.global_position.y > 20.0, "mode=%d spd=%.1f y=%.1f" % [g.mode, g.air_speed, g.global_position.y])
	# Brake / flare.
	teleport(Vector3(60, 30, -20), 1, PI, 0.0)
	g.air_speed = 15.0
	g.bot_input = {"move_back": true}
	await seconds(1.6)
	check("S brakes to a slow flare", g.air_speed < 4.5 and g.sink <= 2.3, "spd=%.1f sink=%.1f" % [g.air_speed, g.sink])
	g.bot_input = {"move_back": true, "flap": true}
	var yh: float = g.global_position.y
	await seconds(1.5)
	check("brake + Space hovers (no plummet)", g.global_position.y > yh - 1.0, "dy=%.2f" % (g.global_position.y - yh))
	# Landing assist onto open ground (Royal Avenue Gardens).
	teleport(Vector3(-10, 14, -100), 1, PI, -0.2)
	g.air_speed = 9.0
	g.bot_input = {"land": true}
	var landed := await wait_until(func(): return g.mode == 0, 12.0)
	check("Ctrl landing assist settles onto the ground", landed, "mode=%d y=%.1f" % [g.mode, g.global_position.y])
	check("clean landing without tumble", m().stats["tumbles"] == 0)
	# Walking.
	g.bot_input = {"move_forward": true}
	var p0: Vector3 = g.global_position
	await seconds(1.0)
	check("WASD walks on foot", g.global_position.distance_to(p0) > 1.5, "moved %.2f" % g.global_position.distance_to(p0))
	g.bot_input = {}
	await frames(15)
	g.bot_input = {"flap": true}
	took = await wait_until(func(): return g.mode == 1, 1.0)
	check("can take off again from the ground", took)
	# Missed landing: fly hard into a wall.
	teleport(Vector3(-68, 20, -37), 1, PI * 0.5, 0.0)
	look_at_point(Vector3(-84, 20, -37))
	g.air_speed = 22.0
	g.bot_input = {}
	var tumbled := await wait_until(func(): return g.mode == 3, 2.0)
	check("crashing into a wall tumbles (not death)", tumbled, "mode=%d" % g.mode)
	var recovered := await wait_until(func(): return g.mode == 1 or g.mode == 0, 3.0)
	check("a tumble recovers to flight or footing", recovered, "mode=%d" % g.mode)
	# Fast shallow roof contact skims rather than sticking.
	# Water landing and takeoff.
	teleport(Vector3(80, 4, 10), 1, PI, -0.3)
	g.air_speed = 8.0
	g.bot_input = {"move_back": true}
	var swam := await wait_until(func(): return g.mode == 2, 6.0)
	check("can land on the water and float", swam, "mode=%d y=%.2f" % [g.mode, g.global_position.y])
	g.bot_input = {}
	await frames(20)
	g.bot_input = {"flap": true}
	took = await wait_until(func(): return g.mode == 1, 1.0)
	check("can take off from the water", took)
	g.bot_input = {}
	await shot("03_flight")


func suite_perch() -> void:
	var mi := await launch("m1")
	mi.complete_objective("takeoff")
	mi.set_objective("perch", "active")
	var g := gull()
	var target: Vector3 = mi.station_perch.global_position
	teleport(target + Vector3(14, 6, 2), 1)
	look_at_point(target)
	g.air_speed = 8.0
	g.bot_input = {"land": true}
	var ok := await wait_until(func(): return g.mode == 0 and g.perch == mi.station_perch, 4.0)
	check("landing assist glides onto the station perch", ok, "mode=%d perch=%s" % [g.mode, str(g.perch.perch_name) if g.perch else "none"])
	g.bot_input = {}
	await frames(10)
	check("perch objective completes", mi.objective_state("perch") == "done")
	check("lunch and dispatch objectives open", mi.objective_state("lunch") == "active" and mi.objective_state("dispatch") == "active")
	await shot("04_station_perch")
	# Low-speed hover near a perch settles onto it (forgiving approach).
	teleport(D.COVE_LAMP + Vector3(1.2, 1.0, 0.3), 1)
	g.air_speed = 2.0
	g.bot_input = {"move_back": true}
	ok = await wait_until(func(): return g.mode == 0 and g.perch == mi.lamp_perch, 3.0)
	check("a slow hover near a perch settles onto it", ok, "mode=%d" % g.mode)
	g.bot_input = {}
	# Scout and tag the sentry from the lamp.
	look_at_point(sentry().head_position())
	g.bot_input = {"scout": true}
	ok = await wait_until(func(): return sentry().tagged, 3.0)
	check("scouting (hold RMB) tags the sentry", ok)
	await shot("05_scouting")
	g.bot_input = {}
	check("tagging completes the optional scout objective", mi.objective_state("scout") == "done")


func suite_food() -> void:
	var mi := await launch("m1")
	mi.debug_skip_tutorial()
	var g := gull()
	var chip: Node3D = mi.chips[0]
	teleport(chip.global_position + Vector3(0.3, 0.4, 0.2), 1, 0, -0.5)
	g.air_speed = 1.0
	g.action("interact")
	await frames(3)
	check("fly-by snatch grabs a chip", g.beak_item != null and g.beak_item.kind == "chip", str(g.beak_item.kind) if g.beak_item else "none")
	g.action("eat")
	await seconds(1.2)
	var food: Array = mi.stats["food"]
	check("eating a chip awards food points", food.size() == 1 and int(food[0]["points"]) == 15)
	check("chip bonus is awarded", food.size() == 1 and int(food[0]["bonus"]) == 25)
	check("lunch objective completes after eating", mi.objective_state("lunch") == "done")
	check("eating refills payload", g.payload == int(g.profile["max_payload"]))
	await shot("06_chip_eaten")
	# Pasty: snatch and stash at the nest.
	teleport(mi.pasty.global_position + Vector3(0.6, 0.2, 0), 0)
	await frames(10)
	g.action("interact")
	await frames(3)
	check("pasty snatched from the windowsill", g.beak_item == mi.pasty)
	teleport(D.NEST + Vector3(0, 0.4, 0), 0)
	await frames(5)
	check("prompt offers to stash at the nest", "Stash" in mi.get_prompt(), mi.get_prompt())
	g.action("interact")
	await frames(3)
	var last: Dictionary = mi.stats["food"].back()
	check("stashing a pasty awards points + pasty bonus + pantry", last["kind"] == "pasty" and int(last["bonus"]) == 60 and int(last["pantry"]) == 15 and last["how"] == "stashed")
	# Beak-slot rule: holding the dispatch blocks grabbing food until set down.
	teleport(D.COVE_TABLE + Vector3(0, 1.3, 0), 0)
	sentry().jump_to_step(3)
	await frames(10)
	g.action("interact")
	await frames(3)
	check("dispatch grabbed", g.beak_item == mi.dispatch)
	var chip2: Node3D = null
	for c in mi.chips:
		if c.is_grabbable():
			chip2 = c
			break
	teleport(Vector3(33.55, D.QUAY + 0.31, chip2.global_position.z), 0, PI * 0.5)
	await frames(5)
	check("holding the dispatch: prompt explains the beak-slot choice", "Beak full" in mi.get_prompt(), mi.get_prompt())
	g.action("interact")
	await frames(3)
	check("E sets the dispatch down", g.beak_item == null and mi.dispatch.state == Item.State.LOOSE)
	await frames(30)
	g.action("interact")
	await frames(3)
	check("then the snack can be taken", g.beak_item != null and g.beak_item.is_food, (str(g.beak_item.kind) if g.beak_item else "none") + " gull=%s chip=%s mode=%d" % [str(g.global_position), str(chip2.global_position), g.mode])
	g.action("eat")
	await seconds(1.2)
	teleport(mi.dispatch.global_position + Vector3(0, 0.4, 0), 0)
	await frames(5)
	g.action("interact")
	await frames(3)
	check("set-down dispatch can be picked up again", g.beak_item == mi.dispatch)


func suite_m1_unseen() -> void:
	var mi := await launch("m1")
	mi.debug_skip_tutorial()
	var g := gull()
	var s := sentry()
	# Wait on the Harbour Office gutter while he is at his post.
	s.jump_to_step(0)
	teleport(D.HARBOUR_GUTTER + Vector3(0, 0.35, 0), 0, -PI * 0.5, -0.5)
	await seconds(3.0)
	check("on the gutter, a calm sentry ignores the gull", s.suspicion < 5.0 and s.state == Guard.S.ROUTINE, "susp=%.1f state=%s" % [s.suspicion, s.state_name()])
	await shot("07_gutter_watch")
	# Wait for his routine to take him to the fort (back to the table).
	var at_fort := await wait_until(func(): return s.step_index() == 3 or (s.step_index() == 2 and s.global_position.z > 85.0), 70.0)
	check("routine takes him away from the table", at_fort, "step=%d pos=%s" % [s.step_index(), str(s.global_position)])
	await wait_until(func(): return s.global_position.z > 90.0, 25.0)
	# Drop from the gutter to the table, snatch, climb away over the roof.
	teleport(D.COVE_TABLE + Vector3(0.6, 1.4, 0), 1, PI * 0.5, -0.6)
	g.air_speed = 2.0
	g.bot_input = {"move_back": true}
	g.action("interact")
	await frames(4)
	check("snatched the dispatch while his back is turned", g.beak_item == mi.dispatch)
	teleport(Vector3(-6, 18, 73), 1, PI * 0.5, 0.2)
	g.air_speed = 12.0
	g.bot_input = {"move_forward": true}
	await seconds(1.0)
	check("unseen route: never spotted", int(mi.stats["spotted"]) == 0 and s.state != Guard.S.ALERT, "spotted=%d state=%s susp=%.1f" % [int(mi.stats["spotted"]), s.state_name(), s.suspicion])
	check("deliver objective is now active", mi.objective_state("deliver") == "active")
	# Deliver to the Dorothy May and finish lunch.
	teleport(mi.pot.global_position + Vector3(0, 1.0, 0.5), 1)
	g.air_speed = 1.0
	g.bot_input = {"move_back": true}
	await frames(3)
	check("delivery prompt shows at the lobster pot", "Deliver" in mi.get_prompt(), mi.get_prompt())
	g.action("interact")
	await frames(3)
	check("dispatch delivered", mi.objective_state("deliver") == "done" and mi.dispatch.state == Item.State.DELIVERED)
	g.bot_input = {}
	var chip: Node3D = mi.chips[0]
	teleport(chip.global_position + Vector3(0, 0.4, 0), 0)
	await frames(5)
	g.action("interact")
	await frames(3)
	g.action("eat")
	await seconds(5.0)
	check("mission completes after delivery + lunch", mi.completed and not mi.running)
	check("results screen is shown", main.menus.current == "results")
	var r: Dictionary = mi.compute_results()
	var has_stealth := false
	for l in r["lines"]:
		if str(l[0]).begins_with("Stealth: never spotted"):
			has_stealth = true
	check("results include the ghost stealth bonus", has_stealth)
	check("results show a total score", int(r["total"]) > 900, "total=%d grade=%s" % [int(r["total"]), r["grade"]])
	check("progress saved as completed (in memory)", Game.is_completed("m1"))
	await seconds(4.0)
	await shot("08_results_unseen")


func suite_m1_distraction() -> void:
	var mi := await launch("m1")
	mi.debug_skip_tutorial()
	var g := gull()
	var s := sentry()
	s.jump_to_step(0)
	await frames(10)
	# Hover high above him (outside a calm sentry's eyeline) and release.
	var above: Vector3 = s.global_position + Vector3(0, 9.0, 0)
	teleport(above, 1, PI * 0.5, -1.2)
	g.air_speed = 0.0
	await frames(2)
	var pred: Vector3 = g.predicted_impact()
	g.poop()
	var hit := await wait_until(func(): return s.state == Guard.S.DISTRACTED, 3.0)
	check("a poop hit on the sentry triggers the distraction", hit, "state=%s pred=%s" % [s.state_name(), str(pred)])
	check("the hit is scored", int(mi.stats["guard_hits"]) == 1 and int(mi.stats["hits"]) == 1)
	teleport(Vector3(-4, 22, 70), 1, PI * 0.5, -0.4)
	await shot("09_poop_hit")
	var away := await wait_until(func(): return s.is_busy(), 20.0)
	check("he walks off to scrub at the pump (busy)", away and s.global_position.distance_to(D.COVE_TABLE) > 18.0, "dist=%.1f" % s.global_position.distance_to(D.COVE_TABLE))
	# The opening: grab from the table while he scrubs.
	teleport(D.COVE_TABLE + Vector3(0, 0.5, 0), 0, PI * 0.5)
	await frames(10)
	g.action("interact")
	await frames(3)
	check("dispatch taken during the opening", g.beak_item == mi.dispatch)
	teleport(Vector3(-10, 20, 60), 1, 0.0, 0.0)
	await seconds(1.0)
	check("distraction route: never spotted", int(mi.stats["spotted"]) == 0, "spotted=%d" % int(mi.stats["spotted"]))
	var back := await wait_until(func(): return s.state == Guard.S.ROUTINE or s.state == Guard.S.SEARCH or s.discovered_theft, 40.0)
	check("he returns after the distraction", back, "state=%s" % s.state_name())
	var noticed := await wait_until(func(): return s.discovered_theft, 30.0)
	check("on returning he discovers the theft", noticed)


func suite_m1_tea() -> void:
	var mi := await launch("m1")
	mi.debug_skip_tutorial()
	var g := gull()
	var s := sentry()
	s.jump_to_step(2)
	await frames(10)
	var mug_pos: Vector3 = mi.mug.global_position
	teleport(mug_pos + Vector3(0, 7.0, 0), 1, 0.0, -1.3)
	await frames(2)
	g.poop()
	var hit := await wait_until(func(): return s.state == Guard.S.DISTRACTED and s.distraction_kind() == "tea", 3.0)
	check("poop in the tea sends him for a refill", hit, "state=%s kind=%s" % [s.state_name(), s.distraction_kind()])
	check("tea hit is scored", int(mi.stats["tea_hits"]) == 1)
	var gone := await wait_until(func(): return s.is_busy(), 30.0)
	check("he reaches the field kitchen up the lane", gone and s.global_position.distance_to(D.COVE_KITCHEN) < 3.5, "pos=%s" % str(s.global_position))
	var eye: Vector3 = s.head_position()
	check("from the kitchen the table is out of his line of sight", not mi.line_of_sight(eye, D.COVE_TABLE + Vector3(0, 1.0, 0)))
	teleport(D.COVE_TABLE + Vector3(0, 0.5, 0), 0)
	await frames(10)
	g.action("interact")
	await frames(3)
	check("dispatch taken while he fetches tea", g.beak_item == mi.dispatch and int(mi.stats["spotted"]) == 0)


func suite_m1_spotted() -> void:
	var mi := await launch("m1")
	mi.debug_skip_tutorial()
	var g := gull()
	var s := sentry()
	s.jump_to_step(0)
	await frames(10)
	# Walk right up to the table in front of him.
	teleport(D.COVE_TABLE + Vector3(0, 0.5, 0), 0, -PI * 0.5)
	var alerted := await wait_until(func(): return s.state == Guard.S.ALERT, 5.0)
	check("in front of him at the table, he spots the gull", alerted, "state=%s susp=%.1f" % [s.state_name(), s.suspicion])
	check("spotting is counted", int(mi.stats["spotted"]) >= 1)
	g.action("interact")
	await frames(3)
	var had: bool = g.beak_item == mi.dispatch
	await shot("10_spotted")
	# He swats or throws: the dispatch is knocked loose.
	mi.knock_gull(s, Vector3(1, 0, 0), 6.0)
	await frames(5)
	check("a knock drops the dispatch", had and g.beak_item == null and mi.dispatch.state == Item.State.LOOSE)
	await wait_until(func(): return mi.dispatch._vel == Vector3.ZERO, 3.0)
	var dpos: Vector3 = mi.dispatch.global_position
	teleport(dpos + Vector3(0, 0.4, 0), 0)
	await frames(3)
	g.action("interact")
	await frames(3)
	check("the dropped dispatch can be recovered", g.beak_item == mi.dispatch)
	# Escape: break line of sight over the roofs.
	teleport(Vector3(-14, 22, 70), 1, PI * 0.5, 0.0)
	g.air_speed = 10.0
	g.bot_input = {"move_forward": true}
	var searching := await wait_until(func(): return s.state == Guard.S.SEARCH, 6.0)
	check("breaking line of sight sends him to search the last-seen spot", searching, "state=%s" % s.state_name())
	teleport(Vector3(-40, 30, 20), 1)
	g.bot_input = {"move_back": true, "flap": true}
	var calm := await wait_until(func(): return s.state == Guard.S.ROUTINE or s.state == Guard.S.RETURN, 40.0)
	check("after searching he returns to his routine (try again)", calm, "state=%s" % s.state_name())
	g.bot_input = {}
	# Guard tidies a loose dispatch he can see.
	var mi2 := await launch("m1")
	mi2.debug_skip_tutorial()
	var s2: Node = mi2.sentry
	s2.jump_to_step(0)
	mi2.dispatch.place_home()
	mi2.dispatch.drop(Vector3.ZERO)
	mi2.dispatch.global_position = D.COVE_TABLE + Vector3(3.0, 0.3, 4.0)
	teleport(Vector3(-30, 30, 0), 1)
	gull().bot_input = {"move_back": true, "flap": true}
	var tidied := await wait_until(func(): return mi2.dispatch.state == Item.State.PLACED, 30.0)
	check("a dispatch left in his sight is put back on the table", tidied, "state=%d guard=%s" % [mi2.dispatch.state, s2.state_name()])
	gull().bot_input = {}


func suite_restart() -> void:
	var mi := await launch("m1")
	mi.debug_skip_tutorial()
	var g := gull()
	var chip: Node3D = mi.chips[0]
	teleport(chip.global_position + Vector3(0, 0.4, 0), 0)
	await frames(5)
	g.action("interact")
	await frames(3)
	g.action("eat")
	await seconds(1.2)
	sentry().jump_to_step(2)
	sentry().suspicion = 70.0
	mi.stats["spotted"] = 2
	check("pre-restart state is dirty", mi.food_total() > 0 and mi.objective_state("lunch") == "done")
	main.restart()
	await frames(5)
	var m2: Node = main.mission
	check("restart builds a fresh mission", m2 != mi and m2.running)
	check("restart resets objectives", m2.objective_state("takeoff") == "active" and m2.objective_state("lunch") == "hidden")
	check("restart resets score", m2.food_total() == 0 and int(m2.stats["spotted"]) == 0 and m2.live_score() == 0)
	check("restart resets pickups", m2.chips.size() == 4 and m2.chips[0].is_grabbable() and m2.dispatch.state == Item.State.PLACED)
	check("restart resets guard behaviour", m2.sentry.state == Guard.S.ROUTINE and m2.sentry.suspicion == 0.0 and m2.sentry.step_index() == 0)
	check("restart puts the gull back on the nest", m2.gull.global_position.distance_to(D.NEST) < 1.5)
	# Pause menu offers restart.
	main.pause()
	await frames(2)
	check("pause menu opens", main.menus.current == "pause" and get_tree().paused)
	main.restart()
	await frames(5)
	check("restart from pause unpauses and rebuilds", not get_tree().paused and main.mission.running)


func suite_settings() -> void:
	await launch("m1")
	var g := gull()
	var ev := InputEventMouseMotion.new()
	ev.relative = Vector2(0, -50)
	Input.mouse_mode = Input.MOUSE_MODE_CAPTURED
	Game.set_setting("invert_y", false)
	var p0: float = g.pitch
	g.apply_mouse_look(ev.relative)
	var up_normal: float = g.pitch - p0
	Game.set_setting("invert_y", true)
	p0 = g.pitch
	g.apply_mouse_look(ev.relative)
	var up_inverted: float = g.pitch - p0
	check("invert-Y flips vertical look", signf(up_normal) == -signf(up_inverted) and absf(up_normal) > 0.0, "%.3f vs %.3f" % [up_normal, up_inverted])
	Game.set_setting("invert_y", false)
	Game.set_setting("mouse_sensitivity", 2.0)
	ev.relative = Vector2(50, 0)
	var y0: float = g.yaw
	g.apply_mouse_look(ev.relative)
	var fast: float = absf(g.yaw - y0)
	Game.set_setting("mouse_sensitivity", 0.5)
	y0 = g.yaw
	g.apply_mouse_look(ev.relative)
	var slow: float = absf(g.yaw - y0)
	check("mouse sensitivity scales look speed", fast > slow * 3.5, "%.4f vs %.4f" % [fast, slow])
	Game.set_setting("mouse_sensitivity", 1.0)
	# Reduced motion: no camera roll while banking.
	teleport(Vector3(60, 30, -20), 1, PI, 0.0)
	g.air_speed = 12.0
	Game.set_setting("reduced_motion", false)
	g.bot_input = {"move_left": true}
	await seconds(1.0)
	var roll_on: float = absf(g.roll_node.rotation.z)
	Game.set_setting("reduced_motion", true)
	await seconds(1.0)
	var roll_off: float = absf(g.roll_node.rotation.z)
	check("camera rolls when banking normally", roll_on > 0.05, "%.3f" % roll_on)
	check("reduced motion removes camera roll", roll_off < 0.02, "%.3f" % roll_off)
	Game.set_setting("reduced_motion", false)
	g.bot_input = {}


# --------------------------------------------------------------------------
# Pilot: fly routes with real flight physics, steering like a mouse.
# --------------------------------------------------------------------------

## Turns the view toward a point at a mouse-like rate.
func steer(target: Vector3, delta: float, rate := 3.5, min_pitch := -0.75) -> void:
	var g := gull()
	var d: Vector3 = target - g.eye_position()
	var want_yaw := atan2(-d.x, -d.z)
	var want_pitch := clampf(atan2(d.y, Vector2(d.x, d.z).length()), min_pitch, 0.55)
	var k := minf(1.0, rate * delta)
	g.yaw = lerp_angle(g.yaw, want_yaw, k)
	g.pitch = lerpf(g.pitch, want_pitch, k)


## Flies toward `target` until within `arrive` metres. Returns success.
func fly_to(target: Vector3, arrive: float, timeout_s: float, brake_near := false) -> bool:
	var g := gull()
	for i in int(timeout_s * 60.0):
		var dist: float = g.global_position.distance_to(target)
		if dist <= arrive:
			return true
		steer(target, 1.0 / 60.0)
		var inp := {}
		if g.mode == 0 or g.mode == 2:
			inp["flap"] = (i % 20) < 3
		else:
			var dy: float = target.y - g.global_position.y
			if brake_near and dist < 10.0:
				inp["move_back"] = true
				if dy > 0.0:
					inp["flap"] = true
			else:
				if g.air_speed < 12.0:
					inp["move_forward"] = true
				if dy > 2.0:
					inp["flap"] = true
		g.bot_input = inp
		await get_tree().physics_frame
	return g.global_position.distance_to(target) <= arrive


## Approaches a perch and lands on it with landing assist.
func perch_on(p: Node3D, timeout_s := 30.0) -> bool:
	var g := gull()
	var ok := await fly_to(p.global_position + Vector3(0, 3.0, 0), 14.0, timeout_s)
	if not ok:
		return false
	for i in 300:
		steer(p.global_position, 1.0 / 60.0, 8.0)
		g.bot_input = {"land": true}
		if g.mode == 0 and g.perch == p:
			g.bot_input = {}
			return true
		await get_tree().physics_frame
	g.bot_input = {}
	return false


## The player technique for snatching from a table: look down at it, brake
## inside 6 m so the wings parachute you onto it, and press E.
func descend_and_grab(item: Node3D, timeout_s: float) -> bool:
	var g := gull()
	for i in int(timeout_s * 60.0):
		var target: Vector3 = item.global_position
		var d: Vector3 = target - g.global_position
		var hd := Vector2(d.x, d.z).length()
		steer(target + Vector3(0, 0.2, 0), 1.0 / 60.0, 8.0, -1.45)
		var inp := {}
		if g.mode == 0:
			# On a roof or ledge: walk towards it and step off the edge.
			if hd > 0.8:
				inp["move_forward"] = true
		elif hd > 6.0:
			inp["move_forward"] = g.air_speed < 9.0
		else:
			inp["move_back"] = true
		g.bot_input = inp
		if g.beak_item == null and i % 15 == 0:
			g.action("interact")
		if Game.cmd.has("trace") and i % 20 == 0:
			print("    trace grab: pos=%s mode=%d spd=%.1f hd=%.1f dy=%.1f tumbles=%d" % [str(g.global_position.snapped(Vector3.ONE * 0.1)), g.mode, g.air_speed, hd, d.y, int(m().stats["tumbles"])])
		if g.beak_item == item:
			g.bot_input = {}
			return true
		await get_tree().physics_frame
	g.bot_input = {}
	return false


func take_off_now() -> void:
	var g := gull()
	g.bot_input = {}
	await frames(2)
	g.bot_input = {"flap": true}
	await wait_until(func(): return g.mode == 1, 1.0)
	await frames(30)


func suite_pilot_unseen() -> void:
	var mi := await launch("m1")
	var g := gull()
	await frames(20)
	g.yaw = -PI * 0.55
	await take_off_now()
	check("pilot: takes off from the nest", g.mode == 1)
	var ok := await perch_on(mi.station_perch, 40.0)
	check("pilot: flies to and lands on the station roof", ok, "pos=%s mode=%d" % [str(g.global_position), g.mode])
	check("pilot: perch objective done", mi.objective_state("perch") == "done")
	# Lunch: a fly-by snatch from the clerk's chips.
	await take_off_now()
	var chip: Node3D = null
	for c in mi.chips:
		if c.is_grabbable():
			chip = c
			break
	ok = await fly_to(chip.global_position + Vector3(0, 1.0, 0), 2.2, 30.0, true)
	g.action("interact")
	await frames(30)
	check("pilot: snatches a chip in flight", g.beak_item != null and g.beak_item.kind == "chip", "dist=%.1f" % g.global_position.distance_to(chip.global_position))
	g.action("eat")
	await seconds(1.2)
	check("pilot: chip eaten with bonus", mi.objective_state("lunch") == "done")
	# Over the roofs to the Harbour Office gutter.
	ok = await fly_to(Vector3(18, 24, 30), 6.0, 30.0)
	ok = await perch_on(mi.gutter_perch, 40.0)
	check("pilot: lands on the Harbour Office gutter", ok, "pos=%s" % str(g.global_position))
	var s := sentry()
	var calm: bool = s.state == Guard.S.ROUTINE
	# Wait for his walk to the fort.
	var gone := await wait_until(func(): return s.step_index() == 3 and s.global_position.distance_to(D.COVE_FORT) < 0.5, 120.0)
	check("pilot: watches the routine until his back is turned", gone and calm)
	# Face the table and hop off the gutter.
	var tt: Vector3 = mi.dispatch.global_position
	g.yaw = atan2(-(tt.x - g.global_position.x), -(tt.z - g.global_position.z))
	await descend_and_grab(mi.dispatch, 12.0)
	check("pilot: drops from the gutter and snatches the dispatch", g.beak_item == mi.dispatch)
	# Escape low up the quay (out of his range) and into the lane, then over the roofs.
	await fly_to(Vector3(14, 6, 56), 4.0, 20.0)
	await fly_to(Vector3(8, 9, 44), 4.0, 20.0)
	await fly_to(Vector3(-20, 24, 20), 6.0, 30.0)
	ok = await fly_to(mi.pot.global_position + Vector3(0, 1.6, 0), 2.0, 40.0, true)
	var carrying: String = str(g.beak_item.display_name) if g.beak_item else "nothing"
	g.action("interact")
	await frames(5)
	check("pilot: delivers to the Dorothy May without landing", mi.objective_state("deliver") == "done", "dist=%.1f carrying=%s dispatch_state=%d" % [g.global_position.distance_to(mi.pot.global_position), carrying, mi.dispatch.state])
	check("pilot: unseen route never spotted", int(mi.stats["spotted"]) == 0, "spotted=%d" % int(mi.stats["spotted"]))
	g.bot_input = {"move_back": true, "flap": true}
	var done := await wait_until(func(): return mi.completed and not mi.running, 6.0)
	check("pilot: mission complete, results shown", done and main.menus.current == "results")
	print("  info: pilot unseen run took %s of game time, tumbles=%d" % [mi.fmt_time(mi.elapsed), int(mi.stats["tumbles"])])
	g.bot_input = {}


func suite_pilot_distraction() -> void:
	var mi := await launch("m1")
	mi.debug_skip_tutorial()
	var g := gull()
	var s := sentry()
	await frames(20)
	await take_off_now()
	var ok := await fly_to(Vector3(28, 22, 40), 6.0, 30.0)
	ok = await perch_on(mi.lamp_perch, 40.0)
	check("pilot: lands on the quay lamp", ok, "pos=%s" % str(g.global_position))
	# Wait until he stands at his post, then make a bombing run over him.
	await wait_until(func(): return s.step_index() == 0 and s.global_position.distance_to(D.COVE_POST) < 0.5, 90.0)
	await take_off_now()
	var head: Vector3 = s.head_position()
	# Line up a long, straight run from the river side, already heading west.
	await fly_to(head + Vector3(70, 11, 0), 4.0, 30.0)
	await fly_to(head + Vector3(48, 10, 0), 2.5, 30.0)
	var released := false
	var best := 99.0
	for i in 900:
		head = s.head_position()
		# Pursue the line through his head with a short lookahead.
		var aim := Vector3(g.global_position.x - 8.0, head.y + 9.5, head.z)
		steer(aim, 1.0 / 60.0, 8.0)
		g.bot_input = {"move_forward": g.air_speed < 9.0}
		var p: Vector3 = g.predicted_impact()
		if Game.cmd.has("trace") and i % 15 == 0:
			print("    trace bomb: pos=%s head=%s pred=%s spd=%.1f" % [str(g.global_position.snapped(Vector3.ONE * 0.1)), str(head.snapped(Vector3.ONE * 0.1)), str(p.snapped(Vector3.ONE * 0.1)) if p != Vector3.INF else "none", g.air_speed])
		if p != Vector3.INF:
			var miss := Vector2(p.x - head.x, p.z - head.z).length()
			best = minf(best, miss)
			# Release when the drop marker turns to ON TARGET.
			if g.drop_on_target:
				g.poop()
				released = true
				break
		await get_tree().physics_frame
	check("pilot: times a release from the drop prediction", released, "closest predicted miss %.2f m" % best)
	var hit := await wait_until(func(): return s.state == Guard.S.DISTRACTED, 4.0)
	check("pilot: a moving drop hits the sentry", hit, "state=%s hits=%d" % [s.state_name(), int(mi.stats["hits"])])
	await fly_to(Vector3(20, 18, 60), 6.0, 20.0)
	await wait_until(func(): return s.is_busy(), 25.0)
	await fly_to(mi.dispatch.global_position + Vector3(9, 6, 0), 3.0, 20.0)
	await descend_and_grab(mi.dispatch, 15.0)
	check("pilot: grabs the dispatch while he scrubs", g.beak_item == mi.dispatch)
	await fly_to(Vector3(14, 6, 56), 4.0, 20.0)
	await fly_to(Vector3(8, 9, 44), 4.0, 20.0)
	await fly_to(Vector3(-20, 24, 20), 6.0, 30.0)
	await fly_to(mi.pot.global_position + Vector3(0, 1.6, 0), 2.0, 40.0, true)
	g.action("interact")
	await frames(5)
	check("pilot: distraction route delivered", mi.objective_state("deliver") == "done")
	check("pilot: distraction route never spotted", int(mi.stats["spotted"]) == 0, "spotted=%d" % int(mi.stats["spotted"]))
	g.bot_input = {}


## Screenshot tour for visual review (run with a display and --shots).
func suite_tour() -> void:
	main.abandon()
	await seconds(2.5)
	await shot("t01_title")
	main.menus.show_select()
	await seconds(0.5)
	await shot("t02a_operations")
	main.show_briefing("m1")
	await seconds(3.5)
	await shot("t02_briefing")
	var mi := await launch("m1")
	var g := gull()
	g.set_physics_process(false)
	var views := [
		["t03_boat_float", Vector3(-34, 24, -66), Vector3(25, 0, -20)],
		["t04_bayards_cove", Vector3(58, 13, 84), Vector3(6, 4, 74)],
		["t05_station_to_cove", Vector3(29, 10.5, -2), Vector3(14, 2, 74)],
		["t06_kingswear", Vector3(34, 9, 10), Vector3(200, 14, -5)],
		["t07_overview", Vector3(130, 85, 150), Vector3(-10, 0, -20)],
	]
	for v in views:
		g.global_position = v[1]
		g._set_mode(1)
		look_at_point(v[2])
		await frames(8)
		await shot(v[0])
	g.set_physics_process(true)
	# HUD in action: scouting the sentry from the lamp.
	mi.debug_skip_tutorial()
	teleport(D.COVE_LAMP + Vector3(0, 0.35, 0), 0)
	sentry().jump_to_step(0)
	sentry().set_tagged(true)
	look_at_point(sentry().head_position())
	await frames(20)
	teleport(D.COVE_TABLE + Vector3(-0.2, 0.6, -1.0), 0)
	look_at_point(sentry().head_position())
	await seconds(1.4)
	await shot("t08_suspicion")
	# The drop marker locking on: hover over the sentry.
	sentry().jump_to_step(2)
	await frames(5)
	teleport(sentry().head_position() + Vector3(2.5, 8.0, 0.0), 1, PI * 0.5, -1.0)
	look_at_point(sentry().global_position)
	g.bot_input = {"move_back": true, "flap": true}
	await wait_until(func(): return g.drop_on_target, 2.0)
	await shot("t08c_on_target")
	g.bot_input = {}
	main.menus.show_results(mi.compute_results(), true, Game.next_mission("m1"))
	Input.mouse_mode = Input.MOUSE_MODE_VISIBLE
	await seconds(4.5)
	await shot("t08b_review")
	var m2 := await launch("m2")
	g = gull()
	m2.debug_set_parade(-84.0, 1.0)
	g.set_physics_process(false)
	g.global_position = Vector3(2, 9.5, -90)
	g._set_mode(1)
	look_at_point(Vector3(24, 3.0, -82))
	await seconds(1.0)
	await shot("t09_parade_stand")
	m2._break_formation()
	await seconds(2.0)
	await shot("t10_parade_chaos")
	g.set_physics_process(true)


func suite_m2() -> void:
	var mi := await launch("m2")
	var g := gull()
	check("mission 2 launches", mi != null and mi.running)
	check("player flies as Bomber lead with a bigger payload", str(g.profile["name"]) == "Bomber lead" and g.payload == 6)
	check("bomber handling turns slower than a standard gull", float(g.profile["turn_rate"]) < 3.2)
	await frames(20)
	await shot("20_m2_start")
	# Scout from the Butterwalk roof.
	look_at_point(mi.voronova.head_position())
	g.bot_input = {"scout": true}
	var tagged := await wait_until(func(): return mi.voronova.tagged, 3.0)
	check("scouting from the rooftops tags Lt Voronova", tagged)
	await shot("21_m2_scout")
	g.bot_input = {}
	check("signal objective opens after scouting", mi.objective_state("signal") == "active")
	# Signalling away from the roost does nothing.
	g.action("signal")
	await frames(2)
	check("signal refused away from the roost", mi.flock[0].state == 0)
	teleport(mi.ROOST + Vector3(0, 0.35, 0), 0, -PI * 0.5)
	await frames(10)
	g.action("signal")
	await frames(2)
	var following := 0
	for a in mi.flock:
		if a.state == 1:
			following += 1
	check("G at the roost scrambles the Bomber Wing", following == 4, "%d following" % following)
	check("strike objective opens", mi.objective_state("strike") == "active")
	# Fly a pass over the formation as it halts in front of the stand.
	mi.debug_set_parade(-80.0, 1.0)
	mi._turn_timer = 6.0
	await frames(30)
	var ac: Vector3 = mi.anchor.global_position
	teleport(ac + Vector3(0, 11.0, 0), 1, PI, -1.5)
	g.air_speed = 0.0
	g.bot_input = {"move_back": true, "flap": true}
	mi.debug_snap_flock()
	await frames(2)
	mi.debug_snap_flock()
	await shot("22_m2_pass")
	g.poop()
	var broken := await wait_until(func(): return mi._chaos_timer > 0.0, 4.0)
	check("a led flock strike in front of the stand breaks the formation", broken, "soldier hits=%d flock=%d" % [int(mi.stats["target_hits"].get("soldier", 0)), int(mi.stats["flock_hits"])])
	check("flock hits are counted separately", int(mi.stats["flock_hits"]) >= 2, str(mi.stats["flock_hits"]))
	check("strike objective completes", mi.objective_state("strike") == "done")
	var chaos := 0
	for mm in mi.marchers:
		if mm.state == 2:
			chaos += 1
	check("the parade scatters", chaos == mi.marchers.size())
	teleport(Vector3(36, 14, -100), 1, PI * 0.5, -0.5)
	look_at_point(mi.STAND + Vector3(0, 3, 0))
	await seconds(1.5)
	await shot("23_m2_chaos")
	var away := await wait_until(func(): return mi.voronova.is_busy(), 10.0)
	check("Voronova leaves the lectern to restore order", away)
	# Take the Order.
	teleport(mi.LECTERN + Vector3(0.4, 1.6, 0), 1, PI * 0.5, -0.8)
	g.air_speed = 1.5
	g.bot_input = {"move_back": true}
	g.action("interact")
	await frames(4)
	check("the Inspection Order is taken in the confusion", g.beak_item == mi.document)
	check("not spotted taking it", int(mi.stats["spotted"]) == 0, "spotted=%d" % int(mi.stats["spotted"]))
	teleport(Vector3(-60, 30, -50), 1, PI * 0.5, 0.0)
	await frames(10)
	teleport(mi.BELFRY + Vector3(0, 0.5, 0), 0)
	await frames(10)
	check("belfry delivery prompt", "Deliver" in mi.get_prompt(), mi.get_prompt())
	g.action("interact")
	await seconds(4.5)
	check("mission 2 completes on delivery", mi.completed and not mi.running)
	var r: Dictionary = mi.compute_results()
	check("mission 2 results scored", int(r["total"]) > 1000, "total=%d grade=%s" % [int(r["total"]), r["grade"]])
	await shot("24_m2_results")
	# A badly timed pass: the formation holds and the Wing goes home to reload.
	var mi2 := await launch("m2")
	mi2.voronova.set_tagged(true)
	mi2._on_tagged(mi2.voronova)
	teleport(mi2.ROOST + Vector3(0, 0.35, 0), 0, -PI * 0.5)
	await frames(10)
	gull().action("signal")
	mi2.debug_set_parade(-122.0, 1.0)
	mi2._turn_timer = 6.0
	await frames(20)
	teleport(mi2.anchor.global_position + Vector3(0, 11.0, -2.7), 1, PI, -1.2)
	gull().bot_input = {"move_back": true, "flap": true}
	mi2.debug_snap_flock()
	await frames(2)
	gull().poop()
	await seconds(3.5)
	check("a strike away from the stand does not break the formation", mi2._chaos_timer <= 0.0 and mi2.objective_state("strike") == "active")
	check("the Wing must be signalled again", mi2.objective_state("signal") == "active")
	var returning := await wait_until(func(): return mi2.flock[0].state == 3 or mi2.flock[0].state == 0, 10.0)
	check("the Wing returns to the roost to reload", returning)
	gull().bot_input = {}
