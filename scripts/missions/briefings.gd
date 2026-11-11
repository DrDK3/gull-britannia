extends RefCounted
## Briefing dossiers. Short, dry and deadly serious about very silly things.

const BRIEFINGS := {
	"m1": {
		"file": "SECTION G / FILE 1",
		"dateline": "DARTMOUTH, DEVON — SATURDAY 3 JUNE 1967 — 07.40 HRS",
		"body": "Operative SCRUMPY (Herring Gull, adult, unbanded),\n\nEach morning a Kommandatura courier leaves a dispatch on a table outside the Harbour Office in Bayards Cove while he takes his breakfast. The table is watched by one sentry, Private G. Borovsky. Borovsky is punctual, unimaginative and devoted to his tea.\n\nYou will first demonstrate flight, perching and the acquisition of lunch, in that order. You will then take the dispatch and place it in the lobster pot aboard the crabber DOROTHY MAY, moored in the Boat Float, where a friend will collect it.\n\nThere are two ways to do this. Wait above him until his back is turned, or give him a reason to leave. The Committee has no preference, provided the result is the same.\n\nRemember: to them you are just a gull. Behave like one, right up until you don't.",
		"orders": ["Take off, fly, and perch on the station roof", "Secure lunch: chips or a pasty (eat, or stash at the nest)", "Steal the courier's dispatch — unseen, or by distraction", "Deliver it to the lobster pot on the Dorothy May"],
		"signed": "— MOTHER, for the Committee",
	},
	"m2": {
		"file": "SECTION G / FILE 2",
		"dateline": "DARTMOUTH — WEDNESDAY 7 JUNE 1967 — 10.55 HRS",
		"body": "Operative SCRUMPY,\n\nThe dispatch you recovered names a submarine, S-197, due to berth in the Dart. Her berthing orders are bound into the Commandant's Inspection Order, which will lie on the lectern of the reviewing stand on the South Embankment this morning while Colonel Grushkov reviews his garrison.\n\nThe lectern is watched by his adjutant, Lieutenant Voronova, who misses nothing — except, we hope, a sky full of gulls.\n\nFor this operation you are attached to the Bomber Wing. Four veterans of the Royal Dart Squadron are waiting on the roof of the Royal Castle Hotel. Signal them, lead them over the parade, and break the formation. In the confusion, take the Order and bring it to the drop on the Dorothy May.\n\nAs bomber lead you will carry a larger payload and turn a little wider. Plan your run.",
		"orders": ["Scout the parade and the reviewing stand from the rooftops", "Signal the flock from the hotel roof [G]", "Lead a strike on the formation as it passes the stand", "Steal the Inspection Order from the lectern", "Deliver it to the Dorothy May"],
		"signed": "— MOTHER, for the Committee",
	},
}


static func get_briefing(id: String) -> Dictionary:
	return BRIEFINGS.get(id, {})
