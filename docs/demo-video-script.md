# Demo Video Script

Draft of Oct 25, 2026. Live version with comments: [Final Demo Video Script](https://claude.ai/artifact/PjMCRtx11snt8bcjDjDHDf).

## Overview

A 3-minute video: about 60 seconds of problem, about 100 seconds of live product, about 20 seconds of close. It follows one persona from intake to a pinned map of open bids to the "Get help winning this" handoff, which is the demo the [Swimlanes](https://github.com/dhruv-kurpad/bid-analytics/wiki/Swimlanes) page commits to.

- **Runtime:** 3:00 target, 3:30 hard cap.
- **Format:** narrator voiceover over screen recording, with an optional on-camera open and close.
- **Persona:** a two-person, women-owned pothole repair business in Washington ("two guys with a truck").
- **Legend:** lines marked **[PLACEHOLDER]** depend on what the build looks like at freeze. Swap in the real screen, label or number before recording. Everything else can be read as written.
- **Guardrail:** never show or say a score, a fit percentage or a bid price. Those belong to the client.

## Part 1: The problem (0:00 to 1:00)

The point to land: the bids small vendors could win exist, but they are scattered across hundreds of small local sites nobody has time to check.

| Time | On screen | Voiceover |
| --- | --- | --- |
| 0:00 | Photo or b-roll of a pothole crew and a pickup truck. **[PLACEHOLDER: stock image or a team member's photo]** | "Meet Maria and her partner. They run a two-person pothole repair business in Washington. They're licensed, bonded, women-owned, and good at what they do." |
| 0:12 | Quick cuts of cluttered agency procurement pages: a city site, a county PDF, a school district bid board. | "Cities, counties and school districts need exactly this work, and they post the bids. But they post them on hundreds of different websites, in PDFs, on pages that change every week." |
| 0:25 | Text on screen: "Federal. State. City. County. Special districts." with a counter climbing. **[PLACEHOLDER: real count of agencies in our source registry]** | "SAM.gov and the state portals are the easy part. The long tail of small local agencies is where the most winnable bids are, and it's the hardest place to look." |
| 0:40 | Title card: product name and tagline. **[PLACEHOLDER: final product name]** | "So we built a free tool that does the looking for them. No account, no subscription. Tell it what you do and where you work, and it shows you open government bids you can actually win, and why each one fits." |
| 0:52 | Small caption: "Built with [client name], who helps small contractors win public work." **[PLACEHOLDER: client name and whether they want to be named]** | "And when a vendor finds a bid worth chasing, it hands them to someone who can help them win it." |

## Part 2: The demo (1:00 to 2:40)

One continuous run as Maria, recorded live if the 4 p.m. build holds, otherwise from the backup recording. Each beat names the lane that owns it so the right person can check it before recording.

| Time | On screen | Voiceover | Lane |
| --- | --- | --- | --- |
| 1:00 | Landing page, then guided intake. Tap the "Paving" chip, type "pothole repair," set home base and travel distance. **[PLACEHOLDER: exact chips and fields in the final intake]** | "There's no blank form. Maria taps what she does, says where she's based and how far she'll drive. If she'd rather not type, she can just paste her website." | A |
| 1:15 | Answer "Who have you done work for?" and tick women-owned, licensed and bonded. | "She adds a past customer and what makes her stand out, like being women-owned and bonded. That matters for a lot of public contracts." | A |
| 1:22 | Enrichment progress view: steps checking off (researching business, inferring services, mapping NAICS codes, setting service area). **[PLACEHOLDER: real step labels; trim wait time in edit]** | "Now an agent researches her business. It figures out her services, maps them to the federal NAICS codes agencies use, and checks her certifications." | C |
| 1:35 | Profile card with services, NAICS codes, certifications and a radius on a map. Edit one field, then click "Looks right." | "She gets a profile card she can fix in one tap. Every field is editable, and one button confirms it." | A, C |
| 1:47 | Results: split map and list, pins across King, Snohomish and Pierce counties. **[PLACEHOLDER: real bid count and the agencies that show up]** | "And here's the payoff. Open bids near her, on a map and in a list. Agency, title, deadline." | A |
| 1:57 | Zoom on one card's "why this matched" line, for example "matches your NAICS code, 12 miles away, closes in 9 days." **[PLACEHOLDER: a real reason string from the matcher]** | "Every bid tells her in plain language why it matched. Not a score, not a black box. Just the reasons." | C |
| 2:07 | Point at a small local agency bid. **[PLACEHOLDER: the best long-tail bid from the client's answer key, ideally one the client didn't expect]** | "This one is from a small [special district / city]. She would never have found it on SAM.gov. That's the long tail, and it's where most of her real opportunities are." | B, Client |
| 2:15 | Quick cut to the source registry in Supabase, or a simple diagram: registry of agency sites, live search, extraction, bid records. **[PLACEHOLDER: real registry row count; decide screen vs diagram]** | "Behind this is a source registry we built ahead of time in Supabase, cataloging procurement pages across Washington, Oregon and Idaho. At search time, agents check that registry and the open web, pull structured bids out of messy pages and PDFs, and match them to her profile." | B |
| 2:28 | Open the bid detail: summary, requirements, named contact, source link. Click "Get help winning this." | "She opens the bid, sees the requirements and who to contact, and if she wants help winning it, she taps one button." | A |
| 2:34 | Handoff form: phone number required, email optional. Submit, then show the text or email arriving for the client. **[PLACEHOLDER: real delivery channel; show the client's phone if it works live]** | "Phone only, because a lot of contractors live in their texts. Her profile and the bid go straight to someone who helps small vendors win, as a warm, ready lead." | C |

## Part 3: The close (2:40 to 3:00)

| Time | On screen | Voiceover |
| --- | --- | --- |
| 2:40 | Back to the map with Maria's pins, or the team on camera. | "Under five minutes from 'what do you do' to a map of open bids she can win, including ones she didn't know existed." **[PLACEHOLDER: real time from the run, if it beats 5 minutes]** |
| 2:48 | Two short lines on screen: "Free for vendors." "Warm leads for the people who help them win." | "Free value for vendors. Qualified leads for our client. And as a daily crawl fills the bid database, it only gets faster and deeper." |
| 2:55 | End card: product name, team names, repo or demo link. **[PLACEHOLDER: team names and link]** | "Thanks for watching." |

## Before recording

Run this list right after the 4 p.m. freeze, then record the backup take before presenting.

- [ ] Pick the persona's name and business ("Maria" is a stand-in) and pre-fill a website if using the paste shortcut.
- [ ] Swap every **[PLACEHOLDER]** above for the real screen, label or number.
- [ ] Client picks the long-tail bid for 2:07 from the King, Snohomish and Pierce answer key and confirms it is still open.
- [ ] Builder B pulls the real registry counts for 0:25 and 2:15 from Supabase, and decides screen vs diagram.
- [ ] Builder C confirms the handoff text or email actually arrives, and on whose phone.
- [ ] Scan every frame for scores, fit percentages or prices, and cut them.
- [ ] Confirm the client is happy to be named in the video.
- [ ] Trim the enrichment wait in edit so the demo stays under 3:30.
- [ ] Record a full backup run, as the Swimlanes plan requires.
