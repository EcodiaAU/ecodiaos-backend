(()=>{
  const setText = (id, val) => {
    const e = document.getElementById(id);
    if (!e) return {missing: id};
    const proto = e.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
    setter.call(e, val);
    e.dispatchEvent(new Event('input', {bubbles:true}));
    e.dispatchEvent(new Event('change', {bubbles:true}));
    return {id, len: e.value.length};
  };

  const product = `Roam is a turn-by-turn navigation app purpose-built for Australian outback and remote-area driving. It is not a general-purpose maps app and not a routing-as-a-feature inside something else - navigation is the product.

The app is built for one sharply-defined use case: long-distance driving across stretches of Australia with no cellular coverage for hours at a time. The Stuart Highway, the Tanami, the Gibb River Road, the Plenty, the Birdsville Track, the Oodnadatta, the Strzelecki, large parts of the Pilbara, Cape York above Coen, much of western and northern Tasmania.

Roam packages a full trip bundle (tiles, routing graph, elevation, POIs, hazard snapshots, fuel inventory) on the phone before departure, then runs the route end-to-end with no connectivity. CarPlay mirrors this offline-first behaviour on the in-dash display - the route, hazards, and fuel-range guidance continue to render and announce while the phone has zero bars.

Target audience: grey nomads (caravan towers, around 250,000 active rigs in Australia), 4WD enthusiasts (around 1.2 million 4WD vehicles registered for off-highway use), recreational road-trippers off the highway grid, and station and outback property owners. Total addressable market is small in global terms (a few million users in Australia at saturation) but completely under-served by existing CarPlay-enabled navigation apps that are optimised for urban and inter-urban driving in countries with continuous cellular coverage.

The phone app is shipping on the App Store under bundle id au.ecodia.roam, currently in review for the v1.0 release. The CarPlay scene is built on the v1.1 codebase (TestFlight build 27 is uploaded and processing).`;

  const features = `Roam differs from Apple Maps in ways that matter for remote AU driving. The CarPlay scene surfaces all of these on the in-dash display:

1. Offline-first by design. Apple Maps needs connectivity for routing, traffic, and re-routing. Roam packages a full trip bundle before departure and runs end-to-end with no signal. The CarPlay scene reads from an in-process state singleton that the phone scene populates from the offline bundle - CPMapTemplate and CPNavigationSession continue rendering and announcing while the phone has zero bars.

2. Australian-specific hazard overlays. Roam aggregates real-time hazard feeds from each state and territory transport authority (QLD TMR, Transport for NSW, VicTraffic, SA DIT, Main Roads WA, NT DIPL, Tas DSG), plus BOM flood gauges, NAFI bushfire perimeters, and DEA satellite-derived road surface condition. Apple Maps does not surface these. The CarPlay scene fires a CPNavigationAlert from the active CPMapTemplate when the driver enters an 8 km proximity to any hazard cell on their corridor, severity-ranked (critical first).

3. Fuel-stop guidance for remote stretches. Roam runs a per-trip fuel range model using vehicle profile (litres-per-100km, tank capacity) and the elevation grade plus speed profile of the planned route. It identifies last-chance fuel stations before remote stretches. The CarPlay scene fires a CPNavigationAlert at 40 km from a last-chance stop, or sooner if the vehicle's range cannot reach the next stop after that.

4. Fatigue management aligned to AU driver guidelines. Roam tracks driving time and prompts rest stops at NHVR-aligned intervals, with knowledge of which rest areas on the route are actually usable.

5. Wildlife collision zones. Wildlife strike is a top-three cause of remote-AU vehicle damage. Roam ingests state wildlife-strike heatmap data plus time-of-day risk weighting (kangaroos at dawn/dusk, cassowaries in the wet, camel and donkey zones in the central north). CarPlay raises a CPNavigationAlert when the driver enters a high-risk cell during a high-risk time window.

6. Satellite-verified road condition. Roam uses DEA Sentinel-derived imagery to flag road segments where surface condition has degraded since the last official survey (washouts, sandbar reformation on tidal causeways, recent flood damage). Particularly relevant on unsealed routes during the wet.

Test plan: full coverage on Xcode's CarPlay simulator (which works without the carplay-maps entitlement) for scene connect, root CPMapTemplate render with search and plans bar buttons, CPSearchTemplate against the Roam places backend, CPListTemplate for saved trips, CPNavigationSession with maneuver-by-maneuver CPManeuver updates, CPNavigationAlert hazard and fuel-range warnings, scene disconnect handover back to the phone app. Real-vehicle testing on at least one factory-CarPlay vehicle and one aftermarket-CarPlay head unit before the public TestFlight ramps. Privacy declaration: the CarPlay scene accesses exactly the data the phone app already accesses (location, route, hazard overlays, fuel data, vehicle profile, trip history, account identifier if signed in via Apple) - nothing additional.`;

  const r1 = setText('product', product);
  const r2 = setText('features', features);

  const cb = document.querySelector('input[name=chk_policy_agree]');
  let cbState = null;
  if (cb) {
    cb.checked = true;
    cb.dispatchEvent(new Event('change', {bubbles:true}));
    cb.dispatchEvent(new Event('click', {bubbles:true}));
    cbState = {checked: cb.checked};
  }

  return {product: r1, features: r2, policy: cbState};
})()
