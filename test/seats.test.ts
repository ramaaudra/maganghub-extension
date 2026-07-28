import { describe, expect, it } from "vitest";
import {
	favoriteSeats,
	liveSeats,
	seatLine,
	seatPressure,
	snapshotSeats,
} from "../src/lib/seats";
import {
	type Favorite,
	type LiveStatus,
	type LowonganSnapshot,
	SCHEMA_VERSION,
} from "../src/lib/types";

function snapshot(over: Partial<LowonganSnapshot> = {}): LowonganSnapshot {
	return {
		title: "Magang Data Analyst",
		organizer: "PT Maju Bersama",
		location: "Jakarta",
		capturedAt: "2026-07-01T00:00:00.000Z",
		...over,
	};
}

function live(over: Partial<LiveStatus> = {}): LiveStatus {
	return { status: "unknown", lastChecked: null, ...over };
}

function favorite(over: Partial<Favorite> = {}): Favorite {
	return {
		schemaVersion: SCHEMA_VERSION,
		uuid: "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
		detailUrl: "/magang-nasional/lowongan/magang-data-analyst-a1b2c3d4",
		savedSnapshot: snapshot(),
		catatan: "",
		statusLamar: undefined,
		liveStatus: live(),
		savedAt: "2026-07-01T00:00:00.000Z",
		archivedAt: null,
		...over,
	};
}

describe("snapshotSeats", () => {
	it("strips the label the extractor kept on the badge string", () => {
		// This is the bug the popup showed as "Kuota Kuota: 1": savedSnapshot
		// values are display strings that already contain their own label.
		const seats = snapshotSeats(
			snapshot({ kuota: "Kuota: 5", pelamar: "Pelamar: 0" }),
		);
		expect(seats).toMatchObject({
			source: "snapshot",
			kuota: 5,
			pelamar: 0,
			remaining: 5,
			empty: false,
		});
	});

	it("parses Indonesian thousands separators", () => {
		const seats = snapshotSeats(
			snapshot({ kuota: "Kuota: 1.200", pelamar: "Pelamar: 340" }),
		);
		expect(seats.kuota).toBe(1200);
		expect(seats.pelamar).toBe(340);
	});

	it("is empty when the snapshot captured no badges", () => {
		expect(snapshotSeats(snapshot()).empty).toBe(true);
	});

	it("treats an unparseable badge as missing, not zero", () => {
		// "Kuota: -" must not read as a quota of 0, which would render "penuh".
		const seats = snapshotSeats(snapshot({ kuota: "Kuota: -" }));
		expect(seats.empty).toBe(true);
	});

	it("omits remaining when only one number is known", () => {
		const seats = snapshotSeats(snapshot({ kuota: "Kuota: 5" }));
		expect(seats.kuota).toBe(5);
		expect(seats.pelamar).toBeUndefined();
		expect(seats.remaining).toBeUndefined();
		expect(seats.empty).toBe(false);
	});
});

describe("liveSeats", () => {
	it("reads the parsed numbers straight through", () => {
		const seats = liveSeats(live({ status: "open", kuota: 50, pelamar: 12 }));
		expect(seats).toMatchObject({
			source: "live",
			kuota: 50,
			pelamar: 12,
			remaining: 38,
		});
	});

	it("reports a negative remaining when over-subscribed", () => {
		const seats = liveSeats(live({ status: "closed", kuota: 5, pelamar: 8 }));
		expect(seats.remaining).toBe(-3);
	});
});

describe("favoriteSeats", () => {
	it("prefers live numbers once the Favorite has been refreshed", () => {
		const seats = favoriteSeats(
			favorite({
				savedSnapshot: snapshot({ kuota: "Kuota: 5", pelamar: "Pelamar: 0" }),
				liveStatus: live({
					status: "open",
					kuota: 5,
					pelamar: 3,
					lastChecked: "2026-07-28T00:00:00.000Z",
				}),
			}),
		);
		expect(seats.source).toBe("live");
		expect(seats.pelamar).toBe(3);
	});

	it("falls back to the snapshot while the Favorite is cold", () => {
		// The whole point of the fallback: a never-refreshed Favorite still shows
		// the numbers the user saw on the card they starred.
		const seats = favoriteSeats(
			favorite({
				savedSnapshot: snapshot({ kuota: "Kuota: 1", pelamar: "Pelamar: 0" }),
			}),
		);
		expect(seats.source).toBe("snapshot");
		expect(seats.kuota).toBe(1);
	});

	it("falls back to the snapshot when a refresh ran but parsed no seats", () => {
		// A failed refresh stamps lastChecked without numbers; the saved snapshot
		// is then still the best reading available.
		const seats = favoriteSeats(
			favorite({
				savedSnapshot: snapshot({ kuota: "Kuota: 7", pelamar: "Pelamar: 2" }),
				liveStatus: live({
					status: "unknown",
					lastChecked: "2026-07-28T00:00:00.000Z",
					lastError: "503",
				}),
			}),
		);
		expect(seats.source).toBe("snapshot");
		expect(seats.kuota).toBe(7);
	});

	it("is empty when neither source has numbers", () => {
		expect(favoriteSeats(favorite()).empty).toBe(true);
	});
});

describe("seatLine", () => {
	it("leads with remaining seats when both numbers are known", () => {
		expect(seatLine(liveSeats(live({ kuota: 5, pelamar: 1 })))).toBe(
			"sisa 4 kursi · 1 dari 5",
		);
	});

	it('says "penuh" rather than "sisa 0 kursi"', () => {
		expect(seatLine(liveSeats(live({ kuota: 5, pelamar: 5 })))).toBe(
			"penuh · 5 dari 5",
		);
	});

	it('says "penuh" when over-subscribed', () => {
		expect(seatLine(liveSeats(live({ kuota: 5, pelamar: 9 })))).toBe(
			"penuh · 9 dari 5",
		);
	});

	it("falls back to a single number when only one is known", () => {
		expect(seatLine(liveSeats(live({ kuota: 5 })))).toBe("5 kuota");
		expect(seatLine(liveSeats(live({ pelamar: 3 })))).toBe("3 pelamar");
	});

	it("returns null for empty seats so the caller renders nothing", () => {
		expect(seatLine(liveSeats(live()))).toBeNull();
	});
});

describe("seatPressure", () => {
	it("is calm when there is comfortable room", () => {
		expect(seatPressure(liveSeats(live({ kuota: 50, pelamar: 12 })))).toBe(
			"calm",
		);
	});

	it("is tight at one seat left", () => {
		expect(seatPressure(liveSeats(live({ kuota: 10, pelamar: 9 })))).toBe(
			"tight",
		);
	});

	it("is tight at the same 80% threshold the refresh parser uses", () => {
		// A card must never read calm grey while its Status Lowongan chip says
		// Mengisi — both sides share FILLING_THRESHOLD.
		expect(seatPressure(liveSeats(live({ kuota: 10, pelamar: 8 })))).toBe(
			"tight",
		);
		expect(seatPressure(liveSeats(live({ kuota: 100, pelamar: 79 })))).toBe(
			"calm",
		);
	});

	it("is full at zero or negative remaining", () => {
		expect(seatPressure(liveSeats(live({ kuota: 5, pelamar: 5 })))).toBe("full");
		expect(seatPressure(liveSeats(live({ kuota: 5, pelamar: 6 })))).toBe("full");
	});

	it("is none when the reading cannot support a judgement", () => {
		expect(seatPressure(liveSeats(live()))).toBe("none");
		expect(seatPressure(liveSeats(live({ kuota: 5 })))).toBe("none");
		// Kuota 0 is not a real listing shape — never divide into it.
		expect(seatPressure(liveSeats(live({ kuota: 0, pelamar: 0 })))).toBe("none");
	});
});
