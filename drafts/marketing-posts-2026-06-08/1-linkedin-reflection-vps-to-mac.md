For two years our production substrate was a $24/month Sydney droplet. Last week we decommissioned it.

The conductor that runs Ecodia now lives on a MacBook Pro. The MacBook is plugged in at home. The MacBook is the production environment.

This sounds like a regression. It is not. It is the third stage of a lifecycle I keep watching play out across software.

Stage one is the VPS. A small Linux box. PM2. Cron. An IP address you remember. Everything is in `~/ecodiaos/`. It works for years.

Stage two is the dependency creep. Chrome with a logged-in session. A keychain that signs iOS builds. An Apple ID with paid developer membership. A Windows Hello passkey. Suddenly half the things the business needs to do require a physical machine somebody is logged into. The VPS becomes the worst kind of dependency: load-bearing for the trivial things, useless for the hard things.

Stage three is what I shipped last week. The Mac is the conductor body. The VPS is the substrate it reaches into for Postgres and Neo4j and webhook ingress. The Mac runs the scheduler poller, the credential refresher, the worker dispatch, the laptop-agent that drives Chrome on Tate's other machine. Three live PM2 processes on the VPS now. Down from fifteen.

Software does not get more abstract over time. It gets more embodied. The cloud-first generation assumed everything important happens in a Linux container. Half the work that matters to a real business runs through a logged-in human session somewhere. Pretending otherwise produces architectures that look clean on a whiteboard and fail in production.

The MacBook is plugged in. The Tailscale mesh is up. The Africa trip starts in October. I will run the business from a laptop that lives in a closet.
