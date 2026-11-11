extends Node
## Procedural audio. Every sound effect and music cue is synthesised at
## start-up from code, so the project ships no audio files. Music renders in
## resumable slices: on a worker thread on desktop, and a few milliseconds per
## frame in single-threaded browser builds. Registered as the `Sfx` autoload.

const RATE := 22050

var sounds: Dictionary = {}
var music: Dictionary = {}

var _rng := RandomNumberGenerator.new()
var _mutex := Mutex.new()
var _ready_music: Array = []
var _task_id := -1
var _music_jobs: Array = []
var _sliced := false
const MUSIC_ORDER := ["theme", "mission", "chase", "results", "march"]

var _music_a: AudioStreamPlayer
var _music_b: AudioStreamPlayer
var _active_player: AudioStreamPlayer
var _current_cue := ""
var _wanted_cue := ""
var _loops: Dictionary = {}
var _pos_parent: Node3D


func _ready() -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS
	_rng.seed = 1967
	Game.apply_settings()
	_music_a = _make_music_player()
	_music_b = _make_music_player()
	_active_player = _music_a
	_pos_parent = Node3D.new()
	_pos_parent.name = "PositionalSounds"
	add_child(_pos_parent)
	_build_sfx()
	if not Game.cmd.has("no-music"):
		_prepare_music_jobs()
		_sliced = OS.has_feature("web")
		if not _sliced:
			_task_id = WorkerThreadPool.add_task(_build_music_thread, false, "music synth")


func _exit_tree() -> void:
	if _task_id >= 0:
		WorkerThreadPool.wait_for_task_completion(_task_id)
		_task_id = -1


func _make_music_player() -> AudioStreamPlayer:
	var p := AudioStreamPlayer.new()
	p.bus = "Music"
	p.volume_db = -80.0
	add_child(p)
	return p


func _process(delta: float) -> void:
	if _sliced and not _music_jobs.is_empty():
		_music_step(5000)
	_mutex.lock()
	var arrived := _ready_music.duplicate()
	_ready_music.clear()
	_mutex.unlock()
	for pair in arrived:
		music[pair[0]] = pair[1]
		if pair[0] == _wanted_cue and _current_cue != _wanted_cue:
			_start_cue(_wanted_cue)
	# Crossfade.
	var other := _music_b if _active_player == _music_a else _music_a
	_active_player.volume_db = move_toward(_active_player.volume_db, 0.0, 40.0 * delta)
	other.volume_db = move_toward(other.volume_db, -80.0, 50.0 * delta)
	if other.playing and other.volume_db <= -79.0:
		other.stop()


# --------------------------------------------------------------------------
# Public API
# --------------------------------------------------------------------------

func play(sound_name: String, volume_db := 0.0, pitch := 1.0) -> void:
	if not sounds.has(sound_name):
		return
	var p := AudioStreamPlayer.new()
	p.stream = sounds[sound_name]
	p.bus = "SFX"
	p.volume_db = volume_db
	p.pitch_scale = pitch
	add_child(p)
	p.finished.connect(p.queue_free)
	p.play()


func play_at(sound_name: String, pos: Vector3, volume_db := 0.0, pitch := 1.0, max_distance := 80.0) -> void:
	if not sounds.has(sound_name):
		return
	var p := AudioStreamPlayer3D.new()
	p.stream = sounds[sound_name]
	p.bus = "SFX"
	p.volume_db = volume_db
	p.pitch_scale = pitch
	p.unit_size = 10.0
	p.max_distance = max_distance
	_pos_parent.add_child(p)
	p.global_position = pos
	p.finished.connect(p.queue_free)
	p.play()


## Starts, adjusts or stops a looping ambience.
func loop(sound_name: String, on: bool, volume_db := 0.0, pitch := 1.0) -> void:
	if not sounds.has(sound_name):
		return
	var p: AudioStreamPlayer = _loops.get(sound_name)
	if p == null:
		if not on:
			return
		p = AudioStreamPlayer.new()
		p.stream = sounds[sound_name]
		p.bus = "SFX"
		add_child(p)
		_loops[sound_name] = p
	if on:
		p.volume_db = volume_db
		p.pitch_scale = pitch
		if not p.playing:
			p.play()
	elif p.playing:
		p.stop()


func stop_loops() -> void:
	for p in _loops.values():
		(p as AudioStreamPlayer).stop()


func play_music(cue: String) -> void:
	_wanted_cue = cue
	if cue == "":
		_current_cue = ""
		_active_player.volume_db = move_toward(_active_player.volume_db, -80.0, 1.0)
		var tw := create_tween()
		tw.tween_property(_active_player, "volume_db", -80.0, 0.8)
		return
	if cue == _current_cue:
		return
	if music.has(cue):
		_start_cue(cue)


func is_music_ready(cue: String) -> bool:
	return music.has(cue)


func _start_cue(cue: String) -> void:
	_current_cue = cue
	var next := _music_b if _active_player == _music_a else _music_a
	next.stream = music[cue]
	next.volume_db = -30.0
	next.play()
	_active_player = next


# --------------------------------------------------------------------------
# Helpers
# --------------------------------------------------------------------------

func _buf(seconds: float) -> PackedFloat32Array:
	var b := PackedFloat32Array()
	b.resize(int(seconds * RATE))
	b.fill(0.0)
	return b


func _wav(buf: PackedFloat32Array, looped := false, gain := 1.0) -> AudioStreamWAV:
	var n := buf.size()
	var peak := 0.0001
	for i in n:
		peak = maxf(peak, absf(buf[i]))
	var scale := gain * 0.92 / peak
	var bytes := PackedByteArray()
	bytes.resize(n * 2)
	for i in n:
		bytes.encode_s16(i * 2, int(clampf(buf[i] * scale, -1.0, 1.0) * 32000.0))
	var w := AudioStreamWAV.new()
	w.format = AudioStreamWAV.FORMAT_16_BITS
	w.mix_rate = RATE
	w.stereo = false
	w.data = bytes
	if looped:
		w.loop_mode = AudioStreamWAV.LOOP_FORWARD
		w.loop_begin = 0
		w.loop_end = n
	return w


static func _bump(t: float, a: float, b: float) -> float:
	if t < a or t > b:
		return 0.0
	return sin(PI * (t - a) / (b - a))


static func _midi(m: float) -> float:
	return 440.0 * pow(2.0, (m - 69.0) / 12.0)


static func _saw(phase: float) -> float:
	return 2.0 * (phase - floorf(phase)) - 1.0


static func _tri(phase: float) -> float:
	var p := phase - floorf(phase)
	return 4.0 * absf(p - 0.5) - 1.0


## Makes the tail of a buffer blend into its head so it loops without a click.
func _seam(buf: PackedFloat32Array, fade_seconds: float) -> PackedFloat32Array:
	var f := int(fade_seconds * RATE)
	var n := buf.size() - f
	var out := PackedFloat32Array()
	out.resize(n)
	for i in n:
		out[i] = buf[i]
	for i in f:
		var k := float(i) / float(f)
		out[i] = buf[i] * k + buf[n + i] * (1.0 - k)
	return out


# --------------------------------------------------------------------------
# Sound effects
# --------------------------------------------------------------------------

func _build_sfx() -> void:
	sounds["flap"] = _wav(_sfx_flap(), false, 0.55)
	sounds["squawk"] = _wav(_sfx_squawk(1.0), false, 0.7)
	sounds["laugh"] = _wav(_sfx_laugh(), false, 0.7)
	sounds["poop"] = _wav(_sfx_poop(), false, 0.6)
	sounds["splat"] = _wav(_sfx_splat(), false, 0.8)
	sounds["grab"] = _wav(_sfx_grab(), false, 0.6)
	sounds["gulp"] = _wav(_sfx_gulp(), false, 0.7)
	sounds["whistle"] = _wav(_sfx_whistle(), false, 0.6)
	sounds["huh"] = _wav(_sfx_huh(), false, 0.5)
	sounds["alert"] = _wav(_sfx_alert(), false, 0.75)
	sounds["objective"] = _wav(_sfx_bells([72, 76, 79], 0.12), false, 0.6)
	sounds["deliver"] = _wav(_sfx_deliver(), false, 0.8)
	sounds["stamp"] = _wav(_sfx_stamp(), false, 0.9)
	sounds["type"] = _wav(_sfx_type(), false, 0.35)
	sounds["thud"] = _wav(_sfx_thud(), false, 0.6)
	sounds["bonk"] = _wav(_sfx_bonk(), false, 0.7)
	sounds["tea"] = _wav(_sfx_tea(), false, 0.7)
	sounds["throw"] = _wav(_sfx_throw(), false, 0.5)
	sounds["bark"] = _wav(_sfx_bark(), false, 0.7)
	sounds["stomp"] = _wav(_sfx_stomp(), false, 0.5)
	sounds["click"] = _wav(_sfx_type(), false, 0.25)
	sounds["tag"] = _wav(_sfx_bells([84, 91], 0.06), false, 0.45)
	sounds["lost"] = _wav(_sfx_bells([79, 74], 0.14), false, 0.45)
	sounds["signal"] = _wav(_sfx_signal(), false, 0.7)
	sounds["wind"] = _wav(_sfx_wind(), true, 0.6)
	sounds["water"] = _wav(_sfx_water(), true, 0.5)


func _sfx_flap() -> PackedFloat32Array:
	var b := _buf(0.24)
	var lp := 0.0
	for i in b.size():
		var t := float(i) / RATE
		var env := _bump(t, 0.0, 0.09) + 0.7 * _bump(t, 0.1, 0.22)
		lp += 0.12 * (_rng.randf_range(-1.0, 1.0) - lp)
		b[i] = lp * env
	return b


func _sfx_squawk(pitch: float) -> PackedFloat32Array:
	var dur := 0.42
	var b := _buf(dur)
	var phase := 0.0
	var lp := 0.0
	for i in b.size():
		var t := float(i) / RATE
		var k := t / dur
		var f := pitch * (1500.0 - 700.0 * k + 250.0 * sin(k * PI)) * (1.0 + 0.02 * sin(TAU * 38.0 * t))
		phase += f / RATE
		var s := _saw(phase) * 0.6 + sin(TAU * phase * 2.0) * 0.35 + _rng.randf_range(-0.15, 0.15)
		lp += 0.45 * (s - lp)
		var env := minf(t / 0.02, 1.0) * pow(1.0 - k, 1.6)
		b[i] = lp * env
	return b


func _sfx_laugh() -> PackedFloat32Array:
	var b := _buf(0.75)
	var phase := 0.0
	var lp := 0.0
	for i in b.size():
		var t := float(i) / RATE
		var seg := fmod(t, 0.19) / 0.19
		var f := 1250.0 - 380.0 * seg - 120.0 * t
		phase += f / RATE
		var s := _saw(phase) * 0.6 + sin(TAU * phase * 2.0) * 0.3
		lp += 0.4 * (s - lp)
		var env := _bump(seg, 0.0, 0.8) * (1.0 - t / 0.75 * 0.4)
		b[i] = lp * env
	return b


func _sfx_poop() -> PackedFloat32Array:
	var b := _buf(0.14)
	var phase := 0.0
	for i in b.size():
		var t := float(i) / RATE
		var f := 1100.0 * exp(-t * 14.0) + 260.0
		phase += f / RATE
		b[i] = sin(TAU * phase) * exp(-t * 20.0)
	return b


func _sfx_splat() -> PackedFloat32Array:
	var b := _buf(0.34)
	var lp := 0.0
	var phase := 0.0
	for i in b.size():
		var t := float(i) / RATE
		var a := 0.05 + 0.5 * exp(-t * 30.0)
		lp += a * (_rng.randf_range(-1.0, 1.0) - lp)
		phase += (110.0 - 60.0 * t) / RATE
		b[i] = lp * exp(-t * 11.0) * 1.4 + sin(TAU * phase) * exp(-t * 25.0) * 0.7
	return b


func _sfx_grab() -> PackedFloat32Array:
	var b := _buf(0.09)
	var prev := 0.0
	for i in b.size():
		var t := float(i) / RATE
		var n := _rng.randf_range(-1.0, 1.0)
		var hp := n - prev
		prev = n
		var env := exp(-t * 400.0) + exp(-maxf(t - 0.04, 0.0) * 400.0) * (1.0 if t >= 0.04 else 0.0)
		b[i] = hp * env + sin(TAU * 1800.0 * t) * env * 0.3
	return b


func _sfx_gulp() -> PackedFloat32Array:
	var b := _buf(0.45)
	var phase := 0.0
	for i in b.size():
		var t := float(i) / RATE
		var local := fmod(t, 0.2)
		var f := 300.0 * exp(-local * 9.0) + 90.0
		phase += f / RATE
		b[i] = sin(TAU * phase) * _bump(local, 0.0, 0.17)
	return b


func _sfx_whistle() -> PackedFloat32Array:
	var b := _buf(0.9)
	var phase := 0.0
	for i in b.size():
		var t := float(i) / RATE
		var trill := 0.55 + 0.45 * sin(TAU * 27.0 * t)
		phase += (2900.0 + 60.0 * sin(TAU * 27.0 * t)) / RATE
		var env := minf(t / 0.03, 1.0) * minf((0.9 - t) / 0.08, 1.0)
		b[i] = (sin(TAU * phase) + 0.2 * sin(TAU * phase * 2.0)) * trill * env
	return b


func _sfx_huh() -> PackedFloat32Array:
	var b := _buf(0.32)
	var phase := 0.0
	for i in b.size():
		var t := float(i) / RATE
		var f := 520.0 if t < 0.13 else 760.0
		phase += f / RATE
		var local := t if t < 0.13 else t - 0.13
		b[i] = (sin(TAU * phase) * 0.7 + _tri(phase) * 0.3) * exp(-local * 9.0)
	return b


func _sfx_alert() -> PackedFloat32Array:
	var b := _buf(0.7)
	var notes := [62.0, 68.0, 74.0, 50.0]
	var phases := [0.0, 0.0, 0.0, 0.0]
	var lp := 0.0
	for i in b.size():
		var t := float(i) / RATE
		var s := 0.0
		for n in notes.size():
			phases[n] += _midi(notes[n]) / RATE
			s += _saw(phases[n])
		lp += (0.08 + 0.3 * exp(-t * 6.0)) * (s - lp)
		b[i] = lp * minf(t / 0.01, 1.0) * exp(-t * 4.0)
	return b


func _sfx_bells(notes: Array, gap: float) -> PackedFloat32Array:
	var b := _buf(gap * notes.size() + 0.7)
	for n in notes.size():
		var start := int(gap * n * RATE)
		var f := _midi(float(notes[n]))
		for i in range(start, b.size()):
			var t := float(i - start) / RATE
			b[i] += sin(TAU * f * t) * exp(-t * 5.0) + 0.35 * sin(TAU * f * 2.76 * t) * exp(-t * 9.0)
	return b


func _sfx_deliver() -> PackedFloat32Array:
	var b := _sfx_bells([67, 71, 74, 79], 0.09)
	var thump := _sfx_stamp()
	for i in mini(thump.size(), b.size()):
		b[i] += thump[i] * 1.2
	return b


func _sfx_stamp() -> PackedFloat32Array:
	var b := _buf(0.28)
	var lp := 0.0
	for i in b.size():
		var t := float(i) / RATE
		lp += 0.15 * (_rng.randf_range(-1.0, 1.0) - lp)
		b[i] = lp * exp(-t * 30.0) * 2.0 + sin(TAU * (75.0 - 40.0 * t) * t) * exp(-t * 18.0)
	return b


func _sfx_type() -> PackedFloat32Array:
	var b := _buf(0.045)
	var prev := 0.0
	for i in b.size():
		var t := float(i) / RATE
		var n := _rng.randf_range(-1.0, 1.0)
		b[i] = (n - prev) * exp(-t * 220.0) + sin(TAU * 2400.0 * t) * exp(-t * 300.0) * 0.4
		prev = n
	return b


func _sfx_thud() -> PackedFloat32Array:
	var b := _buf(0.16)
	var lp := 0.0
	for i in b.size():
		var t := float(i) / RATE
		lp += 0.1 * (_rng.randf_range(-1.0, 1.0) - lp)
		b[i] = sin(TAU * (130.0 - 300.0 * t) * t) * exp(-t * 26.0) + lp * exp(-t * 35.0)
	return b


func _sfx_bonk() -> PackedFloat32Array:
	var b := _buf(0.42)
	var phase := 0.0
	for i in b.size():
		var t := float(i) / RATE
		var f := 640.0 * exp(-t * 4.5) + 160.0 + 40.0 * sin(TAU * 18.0 * t)
		phase += f / RATE
		b[i] = (sin(TAU * phase) * 0.8 + _tri(phase * 2.0) * 0.2) * exp(-t * 6.0)
	return b


func _sfx_tea() -> PackedFloat32Array:
	var b := _buf(0.55)
	var lp1 := 0.0
	var lp2 := 0.0
	for i in b.size():
		var t := float(i) / RATE
		var n := _rng.randf_range(-1.0, 1.0)
		lp1 += 0.35 * (n - lp1)
		lp2 += 0.06 * (n - lp2)
		var env := _bump(t, 0.0, 0.12) + 0.5 * _bump(t, 0.08, 0.5)
		b[i] = (lp1 - lp2) * env + sin(TAU * 900.0 * t * (1.0 + t)) * exp(-t * 20.0) * 0.15
	return b


func _sfx_throw() -> PackedFloat32Array:
	var b := _buf(0.32)
	var lp := 0.0
	for i in b.size():
		var t := float(i) / RATE
		lp += (0.02 + 0.2 * _bump(t, 0.0, 0.32)) * (_rng.randf_range(-1.0, 1.0) - lp)
		b[i] = lp * _bump(t, 0.0, 0.32)
	return b


func _sfx_bark() -> PackedFloat32Array:
	var b := _buf(0.24)
	var phase := 0.0
	var lp := 0.0
	for i in b.size():
		var t := float(i) / RATE
		var f := 820.0 - 900.0 * t
		phase += f / RATE
		var s := _saw(phase) + _rng.randf_range(-0.3, 0.3)
		lp += 0.3 * (s - lp)
		b[i] = lp * minf(t / 0.008, 1.0) * exp(-t * 14.0)
	return b


func _sfx_stomp() -> PackedFloat32Array:
	var b := _buf(0.12)
	var lp := 0.0
	for i in b.size():
		var t := float(i) / RATE
		lp += 0.2 * (_rng.randf_range(-1.0, 1.0) - lp)
		b[i] = lp * exp(-t * 40.0) + sin(TAU * 70.0 * t) * exp(-t * 30.0) * 0.6
	return b


func _sfx_signal() -> PackedFloat32Array:
	# A rising three-call gull summons.
	var b := _buf(1.1)
	for k in 3:
		var part := _sfx_squawk(0.9 + 0.12 * k)
		var start := int(k * 0.3 * RATE)
		for i in part.size():
			if start + i < b.size():
				b[start + i] += part[i] * (0.7 + 0.15 * k)
	return b


func _sfx_wind() -> PackedFloat32Array:
	var b := _buf(2.6)
	var lp := 0.0
	var lp2 := 0.0
	for i in b.size():
		var t := float(i) / RATE
		var n := _rng.randf_range(-1.0, 1.0)
		lp += 0.06 * (n - lp)
		lp2 += 0.01 * (n - lp2)
		b[i] = (lp * 0.7 + lp2 * 2.0) * (0.8 + 0.2 * sin(TAU * 0.77 * t))
	return _seam(b, 0.4)


func _sfx_water() -> PackedFloat32Array:
	var b := _buf(3.4)
	var lp := 0.0
	var lp2 := 0.0
	for i in b.size():
		var t := float(i) / RATE
		var n := _rng.randf_range(-1.0, 1.0)
		lp += 0.08 * (n - lp)
		lp2 += 0.02 * (n - lp2)
		var lap := pow(0.5 + 0.5 * sin(TAU * 0.9 * t + sin(TAU * 0.3 * t)), 3.0)
		b[i] = (lp - lp2 * 0.5) * (0.25 + lap)
	return _seam(b, 0.4)


# --------------------------------------------------------------------------
# Music — original cues, rendered by a tiny sequencer on a worker thread
# --------------------------------------------------------------------------

func _build_music_thread() -> void:
	while _music_step(1 << 60):
		pass


## Queues one render job per cue: notes, then echo, then peak, then encode.
func _prepare_music_jobs() -> void:
	var rng := RandomNumberGenerator.new()
	rng.seed = 1940
	for cue in MUSIC_ORDER:
		var spec: Dictionary = call("_song_" + cue)
		var spb := 60.0 / float(spec["bpm"])
		var looped: bool = spec.get("loop", true)
		var length := float(spec["beats"]) * spb
		var notes: Array = []
		for track in spec["tracks"]:
			var gain: float = track[1]
			for note in track[2]:
				var vel: float = gain * float(note[3]) if note.size() > 3 else gain
				notes.append([str(track[0]), float(note[0]) * spb, float(note[1]) * spb, float(note[2]), vel])
		_music_jobs.append({
			"cue": cue, "looped": looped, "buf": _buf(length + (0.0 if looped else 1.5)),
			"notes": notes, "ni": 0, "st": {}, "stage": 0, "pos": 0, "peak": 0.0001,
			"bytes": PackedByteArray(), "rng": rng,
		})


## Does up to `budget_usec` of rendering work. Returns true while work remains.
func _music_step(budget_usec: int) -> bool:
	var t0 := Time.get_ticks_usec()
	while not _music_jobs.is_empty():
		if Time.get_ticks_usec() - t0 >= budget_usec:
			return true
		var job: Dictionary = _music_jobs[0]
		var buf: PackedFloat32Array = job["buf"]
		var n := buf.size()
		match int(job["stage"]):
			0:
				var notes: Array = job["notes"]
				if int(job["ni"]) >= notes.size():
					job["stage"] = 1
					job["pos"] = 0
					continue
				var nt: Array = notes[job["ni"]]
				if _render_note(buf, nt[0], nt[1], nt[2], nt[3], nt[4], job["looped"], job["rng"], job["st"], 4096):
					job["ni"] = int(job["ni"]) + 1
					job["st"] = {}
			1:
				# Single-tap echo for a little room.
				var d := int(0.21 * RATE)
				var a: int = job["pos"]
				var b := mini(a + 16384, n)
				var looped: bool = job["looped"]
				for i in range(a, b):
					var j := i - d
					if j < 0:
						if not looped:
							continue
						j += n
					buf[i] += buf[j] * 0.22
				job["pos"] = b
				if b >= n:
					job["stage"] = 2
					job["pos"] = 0
			2:
				var a2: int = job["pos"]
				var b2 := mini(a2 + 32768, n)
				var peak: float = job["peak"]
				for i in range(a2, b2):
					peak = maxf(peak, absf(buf[i]))
				job["peak"] = peak
				job["pos"] = b2
				if b2 >= n:
					job["stage"] = 3
					job["pos"] = 0
					var bytes := PackedByteArray()
					bytes.resize(n * 2)
					job["bytes"] = bytes
			3:
				var a3: int = job["pos"]
				var b3 := mini(a3 + 32768, n)
				var bytes2: PackedByteArray = job["bytes"]
				var scale := 0.85 * 0.92 / float(job["peak"])
				for i in range(a3, b3):
					bytes2.encode_s16(i * 2, int(clampf(buf[i] * scale, -1.0, 1.0) * 32000.0))
				job["pos"] = b3
				if b3 >= n:
					var w := AudioStreamWAV.new()
					w.format = AudioStreamWAV.FORMAT_16_BITS
					w.mix_rate = RATE
					w.stereo = false
					w.data = bytes2
					if job["looped"]:
						w.loop_mode = AudioStreamWAV.LOOP_FORWARD
						w.loop_begin = 0
						w.loop_end = n
					_mutex.lock()
					_ready_music.append([job["cue"], w])
					_mutex.unlock()
					_music_jobs.pop_front()
	return false


## Renders up to `max_n` samples of one note into `buf`, resuming from the
## oscillator state kept in `st`. Returns true when the note is finished.
func _render_note(buf: PackedFloat32Array, inst: String, start: float, dur: float, pitch: float, vel: float, looped: bool, rng: RandomNumberGenerator, st: Dictionary, max_n: int) -> bool:
	var n := buf.size()
	var s0 := int(start * RATE)
	var f := _midi(pitch)
	var release := 0.0
	match inst:
		"strings": release = 0.35
		"brass": release = 0.08
		"bell": release = 1.2
		"pluck": release = 0.05
		"organ": release = 0.05
	var total := int((dur + release) * RATE)
	var i0: int = st.get("i", 0)
	var i_end := mini(total, i0 + max_n)
	var phase: float = st.get("phase", 0.0)
	var phase2: float = st.get("phase2", 0.0)
	var lp: float = st.get("lp", 0.0)
	var prev: float = st.get("prev", 0.0)
	var finished := i_end >= total
	for i in range(i0, i_end):
		var t := float(i) / RATE
		var s := 0.0
		match inst:
			"pluck":
				phase += f / RATE
				var raw := _saw(phase)
				lp += (0.03 + 0.45 * exp(-t * 14.0)) * (raw - lp)
				s = lp * exp(-t * 4.0) * (1.0 if t < dur else exp(-(t - dur) * 60.0))
			"brass":
				var vib := 1.0 + (0.004 * sin(TAU * 5.5 * t) if t > 0.15 else 0.0)
				phase += f * vib / RATE
				var raw := _saw(phase)
				var env := minf(t / 0.045, 1.0) * (0.85 if t < dur else maxf(0.0, 0.85 - (t - dur) / release))
				lp += (0.06 + 0.22 * env) * (raw - lp)
				s = lp * env
			"strings":
				phase += f * 1.003 / RATE
				phase2 += f * 0.997 / RATE
				var raw := _saw(phase) + _saw(phase2)
				lp += 0.07 * (raw - lp)
				var env := minf(t / 0.25, 1.0) * (1.0 if t < dur else maxf(0.0, 1.0 - (t - dur) / release))
				var trem := 1.0 - 0.35 * (0.5 + 0.5 * sin(TAU * 7.0 * t))
				s = lp * env * trem * 0.5
			"organ":
				phase += f / RATE
				s = (sin(TAU * phase) + 0.4 * sin(TAU * phase * 2.0) + 0.2 * _tri(phase * 4.0)) * minf(t / 0.02, 1.0) * (1.0 if t < dur else maxf(0.0, 1.0 - (t - dur) / release))
			"bell":
				s = (sin(TAU * f * t) * exp(-t * 3.0) + 0.3 * sin(TAU * f * 2.76 * t) * exp(-t * 7.0)) * 0.6
			"snare":
				var nz := rng.randf_range(-1.0, 1.0)
				s = nz * exp(-t * 16.0) * 0.5 + sin(TAU * 185.0 * t) * exp(-t * 28.0) * 0.4
			"brush":
				var nz2 := rng.randf_range(-1.0, 1.0)
				lp += 0.3 * (nz2 - lp)
				s = lp * exp(-t * 9.0) * 0.35
			"hat":
				var nz3 := rng.randf_range(-1.0, 1.0)
				s = (nz3 - prev) * exp(-t * 55.0) * 0.18
				prev = nz3
			"kick":
				phase += (45.0 + 70.0 * exp(-t * 25.0)) / RATE
				s = sin(TAU * phase) * exp(-t * 7.0)
			"timp":
				phase += (f * (1.0 + 0.05 * exp(-t * 10.0))) / RATE
				var nz4 := rng.randf_range(-1.0, 1.0)
				s = (sin(TAU * phase) * 0.9 + nz4 * 0.1 * exp(-t * 30.0)) * exp(-t * 2.5)
		var idx := s0 + i
		if idx >= n:
			if not looped:
				finished = true
				break
			idx -= n
		buf[idx] += s * vel
	st["i"] = i_end
	st["phase"] = phase
	st["phase2"] = phase2
	st["lp"] = lp
	st["prev"] = prev
	return finished


## Notes are [beat, length_in_beats, midi_pitch, velocity].
static func _seq(pattern: Array, offset: float, repeat: int, period: float) -> Array:
	var out: Array = []
	for r in repeat:
		for p in pattern:
			var q: Array = p.duplicate()
			q[0] = float(q[0]) + offset + r * period
			out.append(q)
	return out


func _song_theme() -> Dictionary:
	# D minor, i-VI-iv-V. A brooding briefing-room theme.
	var bass := _seq([
		[0, 0.9, 38], [1, 0.45, 45], [1.5, 0.45, 50], [2, 0.9, 48], [3, 0.9, 45],
		[4, 0.9, 34], [5, 0.45, 41], [5.5, 0.45, 46], [6, 0.9, 45], [7, 0.9, 41],
		[8, 0.9, 31], [9, 0.45, 38], [9.5, 0.45, 43], [10, 0.9, 41], [11, 0.9, 38],
		[12, 0.9, 33], [13, 0.45, 40], [13.5, 0.45, 45], [14, 0.9, 49], [15, 0.9, 52],
	], 0, 2, 16)
	var pads := _seq([
		[0, 4, 62], [0, 4, 65], [0, 4, 69],
		[4, 4, 62], [4, 4, 65], [4, 4, 70],
		[8, 4, 62], [8, 4, 67], [8, 4, 70],
		[12, 4, 61], [12, 4, 64], [12, 4, 69],
	], 0, 2, 16)
	var lead := [
		[0, 1.5, 69], [1.5, 0.5, 67], [2, 1, 65], [3, 1, 64],
		[4, 2, 62], [6, 1, 65], [7, 1, 69],
		[8, 1.5, 70], [9.5, 0.5, 69], [10, 1, 67], [11, 1, 74],
		[12, 3, 73],
		[16, 1, 74], [17, 1, 69], [18, 0.5, 65], [18.5, 0.5, 67], [19, 1, 69],
		[20, 2, 70], [22, 1, 69], [23, 1, 67],
		[24, 0.5, 67], [24.5, 0.5, 69], [25, 1, 70], [26, 1, 69], [27, 1, 67],
		[28, 1, 64], [29, 1, 61], [30, 2, 57],
	]
	var perc: Array = []
	for b in 32:
		perc.append([b + 0.5, 0.2, 0, 0.5])
		if b % 2 == 1:
			perc.append([b, 0.3, 0, 1.0])
	var hats: Array = []
	for b in 64:
		hats.append([b * 0.5, 0.1, 0, 0.6 if b % 2 == 0 else 0.35])
	return {"bpm": 84.0, "beats": 32.0, "tracks": [
		["pluck", 0.9, bass], ["strings", 0.32, pads], ["brass", 0.42, lead],
		["brush", 0.6, perc], ["hat", 0.6, hats],
	]}


func _song_mission() -> Dictionary:
	# Sparse tension loop: pizzicato ostinato, high tremolo, ticking.
	var bass := _seq([
		[0, 0.4, 38], [0.75, 0.25, 38], [1.5, 0.4, 39], [2.5, 0.4, 38], [3.25, 0.25, 36],
	], 0, 8, 4)
	var arps: Array = []
	var chord := [62, 65, 69, 72]
	for bar in 8:
		var shift := 0 if bar % 4 < 2 else (-2 if bar % 4 == 2 else 1)
		for k in 4:
			arps.append([bar * 4 + k * 0.5 + 2.0, 0.4, chord[k] + shift, 0.5])
	var pad := [[0, 16, 81, 0.5], [16, 16, 80, 0.5], [0, 32, 57, 0.6]]
	var ticks: Array = []
	for b in 64:
		ticks.append([b * 0.5, 0.1, 0, 0.45 if b % 2 == 0 else 0.25])
	var kicks: Array = []
	for bar in 8:
		kicks.append([bar * 4, 0.5, 0, 0.6])
	return {"bpm": 96.0, "beats": 32.0, "tracks": [
		["pluck", 1.0, bass], ["bell", 0.22, arps], ["strings", 0.18, pad],
		["hat", 0.8, ticks], ["kick", 0.5, kicks],
	]}


func _song_chase() -> Dictionary:
	var bass := _seq([
		[0, 0.4, 38], [0.5, 0.4, 38], [1, 0.4, 41], [1.5, 0.4, 38],
		[2, 0.4, 43], [2.5, 0.4, 38], [3, 0.4, 44], [3.5, 0.4, 43],
	], 0, 8, 4)
	var stabs: Array = []
	for bar in 8:
		var root := 62 if bar % 2 == 0 else 63
		stabs.append([bar * 4, 0.35, root, 1.0])
		stabs.append([bar * 4, 0.35, root + 6, 0.8])
		stabs.append([bar * 4 + 2.5, 0.25, root + 12, 0.7])
	var snares: Array = []
	for b in 32:
		if b % 2 == 1:
			snares.append([b, 0.2, 0, 1.0])
		snares.append([b + 0.75, 0.1, 0, 0.3])
	var kicks: Array = []
	for b in 32:
		if b % 2 == 0:
			kicks.append([b, 0.3, 0, 0.9])
	return {"bpm": 144.0, "beats": 32.0, "tracks": [
		["pluck", 1.0, bass], ["brass", 0.5, stabs], ["snare", 0.7, snares], ["kick", 0.8, kicks],
	]}


func _song_results() -> Dictionary:
	# A pompous civil-service fanfare in B-flat.
	var chords := [
		[0, 1.5, [58, 62, 65]], [1.5, 0.5, [58, 62, 65]], [2, 2, [63, 67, 70]],
		[4, 1.5, [65, 69, 72]], [5.5, 0.5, [63, 67, 70]], [6, 1, [62, 65, 70]], [7, 1, [60, 65, 69]],
		[8, 4, [58, 62, 65, 70]],
	]
	var brass: Array = []
	for c in chords:
		for p in c[2]:
			brass.append([c[0], c[1], p, 0.8])
	var bass := [[0, 2, 34], [2, 2, 39], [4, 2, 41], [6, 2, 41], [8, 4, 34]]
	var timp: Array = []
	for k in 16:
		timp.append([6.0 + k * 0.125, 0.12, 41, 0.3 + k * 0.03])
	timp.append([8, 2, 34, 1.0])
	return {"bpm": 92.0, "beats": 12.0, "loop": false, "tracks": [
		["brass", 0.5, brass], ["pluck", 0.8, bass], ["timp", 0.6, timp],
	]}


func _song_march() -> Dictionary:
	# Parade-ground march for the occupation band (G minor).
	var bass := _seq([[0, 0.5, 31], [1, 0.5, 38], [2, 0.5, 31], [3, 0.5, 38]], 0, 4, 4)
	var bass2 := _seq([[0, 0.5, 27], [1, 0.5, 34], [2, 0.5, 26], [3, 0.5, 33]], 16, 4, 4)
	var tune := [
		[0, 1, 67], [1, 1, 67], [2, 1, 74], [3, 1, 74],
		[4, 0.5, 75], [4.5, 0.5, 74], [5, 0.5, 72], [5.5, 0.5, 70], [6, 2, 69],
		[8, 1, 70], [9, 1, 72], [10, 1, 74], [11, 1, 70],
		[12, 3, 67],
		[16, 1, 74], [17, 1, 75], [18, 1, 77], [19, 1, 75],
		[20, 1, 74], [21, 1, 72], [22, 2, 70],
		[24, 1, 69], [25, 1, 70], [26, 1, 72], [27, 1, 66],
		[28, 3, 67],
	]
	var snare: Array = []
	for b in 32:
		snare.append([b, 0.2, 0, 1.0 if b % 2 == 0 else 0.6])
		snare.append([b + 0.5, 0.1, 0, 0.35])
	var kicks: Array = []
	for b in 32:
		if b % 2 == 0:
			kicks.append([b, 0.3, 0, 0.9])
	return {"bpm": 112.0, "beats": 32.0, "tracks": [
		["brass", 0.55, tune], ["pluck", 0.9, bass + bass2], ["snare", 0.5, snare], ["kick", 0.6, kicks],
	]}
