/* ============================================================
   ANBU BLACK OPS — Operative Roster Data
   ============================================================
   HOW TO UPDATE THE TEAM:
   1. Edit the MEMBERS array below — one object per operative.
   2. Drop the operative's photo into  assets/avatars/  and point
      the `photo` field at that file (any size; it gets cropped
      by the card, so a square photo works best).
   3. Give each operative a unique `slug` — this becomes the
      URL used by their profile page (profile.html?member=<slug>).
   4. Refresh the page. Nothing else needs to change.
   ------------------------------------------------------------
   Each member object:
     name   : codename shown in the big stencil-style font
     photo  : image path (swap in real photos here)
     rank   : unit rank / title (shown in red)
     role   : specialization / role (shown in grey)
     bio    : short one-liner (roster card)
     detail : longer field report shown on the profile page
     slug   : lowercase URL id, used for profile.html?member=<slug>
   ============================================================ */

const MEMBERS = [
  {
    name: "CHARAN",
    photo: "assets/avatars/member-1.svg",
    rank: "Squad Captain",
    role: "Tactical Command",
    bio: "The ghost of the unit. Orders are given, never heard.",
    detail:
      "Directs the full offensive push. Assigns subsystems to the squad, sets the sprint cadence, and reads the arena early — knowing where the judges and the clock will strike before anyone else. Every plan on the board runs through him.",
    slug: "charan"
  },
  {
    name: "VENKY",
    photo: "assets/avatars/member-2.svg",
    rank: "First Division",
    role: "Interrogation & Extraction",
    bio: "Rides the black tide. Silence is a tool, and he is a master.",
    detail:
      "Owns intelligence gathering. Wrangles every public API, digs through the documentation, and extracts the data the build needs. When the squad needs the answer hidden in a haystack, the black tide brings it back clean.",
    slug: "venky"
  },
  {
    name: "ROHIT",
    photo: "assets/avatars/member-3.svg",
    rank: "Second Division",
    role: "Lightning Strikes",
    bio: "Three moves or the mission is over. Usually it takes one.",
    detail:
      "The strike force. Ships the riskiest features fastest — rapid prototypes, hot fixes, and last-minute heroics. If the deadline is breathing down the squad's neck, he is already three moves ahead.",
    slug: "rohit"
  },
  {
    name: "SATVIK",
    photo: "assets/avatars/member-4.svg",
    rank: "Third Division",
    role: "Sensor / Barrier Type",
    bio: "Feels the ripples in the dark before they reach the grid.",
    detail:
      "Sits on the perimeter and watches the build. Monitors the pipeline, catches regressions before they land, and keeps the repository clean. Nothing breaks the grid without his sensors lighting up first.",
    slug: "satvik"
  },
  {
    name: "BALAJI",
    photo: "assets/avatars/member-5.svg",
    rank: "Fourth Division",
    role: "Frontline Assault",
    bio: "Pale blade, white mask, and the footprints vanish at sunrise.",
    detail:
      "Leads the front lines of the user-facing build. Owns the interface, the flows, and the final impression — turning raw logic into something worth staring at. If it ships to the screen, it went through him.",
    slug: "balaji"
  },
  {
    name: "SREESANTH",
    photo: "assets/avatars/member-6.svg",
    rank: "Fifth Division",
    role: "Track & Eliminate",
    bio: "No self, no trail, no witnesses. The roster only remembers him on paper.",
    detail:
      "The clean-up unit. Tracks memory leaks, hunts the bugs that refuse to die, and eliminates them quietly. The arena remembers the name on the leaderboard, but only he remembers what it took to get there.",
    slug: "sreesanth"
  }
];

/* CommonJS export so the backend server can seed its database
   with this same roster data. The browser ignores this branch. */
if (typeof module !== "undefined" && module.exports) {
  module.exports = MEMBERS;
}

/* Expose as a browser global so other scripts can fall back to
   the bundled roster when the backend is unreachable. */
if (typeof window !== "undefined") {
  window.MEMBERS = MEMBERS;
}
