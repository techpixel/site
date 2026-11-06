<script lang="ts">
    import { onMount } from 'svelte';
    // @ts-expect-error — warpjs ships no types
    import Warp from 'warpjs';
    import { sweepStart, SLIDE_FROM } from '../lib/sweep';

    type Mode = 'wave' | 'jelly' | 'tide' | 'flow' | 'none';

    type Props = {
        svg: string;
        mode?: Mode;
        fit?: 'natural' | 'stretch';
        complexity?: number;
        interpolation?: number;
        buffer?: number;
        amplitude?: number;
        speed?: number;
        period?: number;
        tilesX?: number;
        tilesY?: number;
        /** ms for the shape to slide in from the right, riding the wave (wave/jelly only; 0 = no slide). */
        slideIn?: number;
        class?: string;
        style?: string;
    };

    let {
        svg,
        mode = 'none',
        fit = 'natural',
        complexity = 6,
        interpolation = 50,
        buffer = 20,
        amplitude = 24,
        speed = 1,
        period = 600,
        tilesX = 1,
        tilesY = 1,
        slideIn = 0,
        class: className = '',
        style = ''
    }: Props = $props();

    // Functions can't cross the Astro client:only boundary (props are JSON-serialized),
    // so the animator lives here and is selected by `mode`.
    function animateFor(
        mode: Mode,
        amplitude: number,
        speed: number,
        period: number,
    ): ((base: number[][], t: number, shift: number) => number[][]) | null {
        if (mode === 'wave') {
            // single sine wave riding along x — the whole shape ripples horizontally.
            // `shift` carries the shape right through the wave, which stays put, so a
            // shape sliding in rides it like the portfolio's name (NameWarp.svelte). As it
            // slides left the ripples run rightward along it; time moves the wave the same
            // way, so the ambient wave carries on in the intro's direction.
            return (base, t, shift) =>
                base.map(([x, y]) => [x + shift, y + amplitude * Math.sin((x + shift) / period - t * speed)]);
        }
        if (mode === 'jelly') {
            // each control point oscillates with its own phase — organic wobble
            return (base, t, shift) =>
                base.map(([x, y], i) => {
                    const phase = i * 0.55;
                    return [
                        x + shift + amplitude * Math.sin(t * speed + phase),
                        y + amplitude * 0.85 * Math.cos(t * speed * 1.3 + phase * 1.3),
                    ];
                });
        }
        return null;
    }

    let host: HTMLDivElement;

    // Mean-value coordinate warp helpers (port of PavelLaptev/Figma-Warp utils)
    function createPointsArray(width: number, height: number, amount: number, controlBuffer: number) {
        const dot = (length: number, i: number) => (length / amount) * i;
        const idx = [...Array(amount).keys()];

        const left = idx.map((_, i) => [0, dot(height, i)]);
        const bottom = idx.map((_, i) => [dot(width, i), height]);
        const right = idx.map((_, i) => [width, dot(height, i + 1)]).reverse();
        const top = idx.map((_, i) => [dot(width, i + 1), 0]).reverse();

        const points = [...left, ...bottom, ...right, ...top];
        for (const p of points) {
            if (p[0] === 0) p[0] -= controlBuffer;
            if (p[1] === 0) p[1] -= controlBuffer;
            if (p[0] === width) p[0] += controlBuffer;
            if (p[1] === height) p[1] += controlBuffer;
        }
        return points;
    }

    // First pass: compute mean-value weights for each SVG point relative to V
    function warpIt(warp: any, points: number[][]) {
        warp.transform(function (v0: number[], V: number[][] = points) {
            const A: number[] = [];
            const W: number[] = [];
            const L: number[] = [];

            for (let i = 0; i < V.length; i++) {
                const j = (i + 1) % V.length;
                const r0i = Math.hypot(v0[0] - V[i][0], v0[1] - V[i][1]);
                const r0j = Math.hypot(v0[0] - V[j][0], v0[1] - V[j][1]);
                const rij = Math.hypot(V[i][0] - V[j][0], V[i][1] - V[j][1]);
                const dn = 2 * r0i * r0j;
                const r = (r0i ** 2 + r0j ** 2 - rij ** 2) / dn;
                A[i] = isNaN(r) ? 0 : Math.acos(Math.max(-1, Math.min(r, 1)));
            }

            for (let j = 0; j < V.length; j++) {
                const i = (j > 0 ? j : V.length) - 1;
                const r = Math.hypot(V[j][0] - v0[0], V[j][1] - v0[1]);
                W[j] = (Math.tan(A[i] / 2) + Math.tan(A[j] / 2)) / r;
            }

            const Ws = W.reduce((a, b) => a + b, 0);
            for (let i = 0; i < V.length; i++) L[i] = W[i] / Ws;
            return [...v0, ...L];
        });
    }

    // Subsequent passes: re-derive (x, y) from the (possibly moved) polygon V. warpjs's
    // own transform deep-copies every segment (through JSON) and re-encodes every path on
    // each call, which overran the frame budget on the headline's slide-in. So the
    // weights warpIt left on each point are read out once into one flat array, with each
    // path's commands, and a frame is just the weighted sums and one string per path.
    const compiled = new WeakMap<object, (V: number[][]) => void>();
    const pointGroups = [['x1', 'y1'], ['x2', 'y2'], ['x', 'y']];
    function compile(warp: any) {
        const paths = warp.paths.map(({ pathElement, pathData }: any) => {
            const commands: string[] = [];
            const counts: number[] = [];
            const weights: number[] = [];
            for (const segment of pathData) {
                let count = 0;
                pointGroups.forEach(([x, y], g) => {
                    if (!(x in segment && y in segment)) return;
                    weights.push(...segment.extended[g]);
                    count++;
                });
                commands.push(segment.relative ? segment.type : segment.type.toUpperCase());
                counts.push(count);
            }
            return { pathElement, commands, counts, weights: Float64Array.from(weights) };
        });
        return (V: number[][]) => {
            const n = V.length;
            for (const { pathElement, commands, counts, weights } of paths) {
                const out: (string | number)[] = [];
                let k = 0;
                for (let s = 0; s < commands.length; s++) {
                    out.push(commands[s]);
                    for (let p = 0; p < counts[s]; p++, k += n) {
                        let nx = 0, ny = 0;
                        for (let i = 0; i < n; i++) {
                            nx += weights[k + i] * V[i][0];
                            ny += weights[k + i] * V[i][1];
                        }
                        out.push(Math.round(nx * 100) / 100, Math.round(ny * 100) / 100);
                    }
                }
                pathElement.setAttribute('d', out.join(' '));
            }
        };
    }
    function warpReposition(warp: any, points: number[][]) {
        let reposition = compiled.get(warp);
        if (!reposition) compiled.set(warp, (reposition = compile(warp)));
        reposition(points);
    }

    onMount(() => {
        host.innerHTML = svg;
        const svgEl = host.querySelector('svg') as SVGSVGElement | null;
        if (!svgEl) return;

        // 'stretch' fills the container regardless of source ratio (good for the
        // background watermark). 'natural' preserves the source aspect ratio and
        // lets warped points spill outside the viewBox so the wave isn't clipped.
        if (fit === 'stretch') {
            svgEl.setAttribute('preserveAspectRatio', 'none');
        } else {
            svgEl.style.overflow = 'visible';
        }
        svgEl.style.display = 'block';
        svgEl.style.width = '100%';
        svgEl.style.height = '100%';
        svgEl.removeAttribute('width');
        svgEl.removeAttribute('height');

        const vb = svgEl.viewBox.baseVal;
        const tileW = vb && vb.width ? vb.width : 0;
        const tileH = vb && vb.height ? vb.height : 0;
        if (!tileW || !tileH) return;

        // Tile by referencing the original content with <use>. mode='tide'
        // warps are position-periodic with period (tileW, tileH), so every
        // tile renders identically — warping the source paths once and
        // letting <use> replicate them costs 1/(tilesX*tilesY) of warping
        // cloned paths per tile.
        if (tilesX > 1 || tilesY > 1) {
            const uid = `warp-tile-${Math.random().toString(36).slice(2)}`;
            svgEl.innerHTML = `<g id="${uid}">${svgEl.innerHTML}</g>`;
            const fragments: string[] = [];
            for (let y = 0; y < tilesY; y++) {
                for (let x = 0; x < tilesX; x++) {
                    if (x === 0 && y === 0) continue;
                    fragments.push(`<use href="#${uid}" transform="translate(${x * tileW},${y * tileH})"/>`);
                }
            }
            svgEl.insertAdjacentHTML('beforeend', fragments.join(''));
            svgEl.setAttribute('viewBox', `0 0 ${tileW * tilesX} ${tileH * tilesY}`);
        }

        const warp = new Warp(svgEl);
        warp.interpolate(interpolation);

        // Once the SVG has been parsed and the first warp transform applied,
        // tag the host with `.warp-ready` so the parent stylesheet can fade
        // it in. Force a reflow + wait two frames so the browser actually
        // paints the initial `opacity: 0` state before the class flips —
        // otherwise the transition is collapsed to a single frame and skipped.
        void host.offsetHeight;
        requestAnimationFrame(() => {
            requestAnimationFrame(() => host.classList.add('warp-ready'));
        });

        let raf = 0;
        // Shared with the beach's reveal (Portrait.svelte), so the two move together.
        const start = sweepStart(host);

        // Hidden instances (display:none, visibility:hidden or opacity:0 — e.g.
        // the desktop/mobile foreground pair, or an overlay that isn't hovered)
        // still pay full warp cost per frame unless we skip them; nothing they
        // compute is ever painted.
        const isHidden = () =>
            typeof host.checkVisibility === 'function' &&
            !host.checkVisibility({ visibilityProperty: true, opacityProperty: true });

        if (mode === 'tide') {
            // Per-point sine displacement, periodic with (tileW, tileH) so the
            // warp at (x, y) equals the warp at (x + tileW, y + tileH) — tile
            // edges line up and the slide loop is seamless.
            const tau = Math.PI * 2;
            warp.transform(([x, y]: number[]) => [x, y, x, y]); // stash original

            // Cursor-driven phase nudge — adds a subtle reactive warp to the bg.
            let mouseX = 0, mouseY = 0;
            let smoothMx = 0, smoothMy = 0;
            const handleMove = (e: MouseEvent) => {
                mouseX = e.clientX / window.innerWidth - 0.5;  // -0.5..0.5
                mouseY = e.clientY / window.innerHeight - 0.5;
            };
            window.addEventListener('mousemove', handleMove, { passive: true });

            function frame(now: number) {
                if (isHidden()) {
                    raf = requestAnimationFrame(frame);
                    return;
                }
                const t = (now - start) / 1000;
                // Lerp toward the latest cursor pos so the response feels organic
                smoothMx += (mouseX - smoothMx) * 0.06;
                smoothMy += (mouseY - smoothMy) * 0.06;
                const mxPhase = smoothMx * 3.0; // ~½ cycle of phase nudge
                const myPhase = smoothMy * 3.0;
                const mPushX = smoothMx * amplitude * 1.4; // direct push toward cursor
                const mPushY = smoothMy * amplitude * 1.4;

                warp.transform((p: number[]) => {
                    const ox = p[2], oy = p[3];
                    const phaseX = (tau * ox) / tileW;
                    const phaseY = (tau * oy) / tileH;
                    const dx = amplitude * (Math.sin(phaseX + t * speed + mxPhase) + 0.5 * Math.cos(phaseY + t * speed * 1.3)) + mPushX;
                    const dy = amplitude * (Math.cos(phaseY + t * speed * 0.7 + myPhase) + 0.5 * Math.sin(phaseX + t * speed * 1.1)) + mPushY;
                    return [ox + dx, oy + dy, ox, oy];
                });
                raf = requestAnimationFrame(frame);
            }
            raf = requestAnimationFrame(frame);

            return () => {
                cancelAnimationFrame(raf);
                window.removeEventListener('mousemove', handleMove);
            };
        } else if (mode === 'flow') {
            // A river: the displacement is the curl of a stream function made of a few
            // long waves (so it is divergence-free — pure meanders and eddies, no
            // bunching), and the whole field slides across the shape in a direction
            // that slowly rotates, so the current runs top→bottom, then left→right, …
            // `period` sets the meander size, `amplitude` how far points are carried
            // (bounded, so nothing drifts away), `speed` how fast it all moves.
            const tau = Math.PI * 2;
            const k1 = tau / period;
            const k2 = tau / (period * 1.7);
            const k3 = tau / (period * 2.6);
            warp.transform(([x, y]: number[]) => [x, y, x, y]); // stash original

            function frame(now: number) {
                if (isHidden()) {
                    raf = requestAnimationFrame(frame);
                    return;
                }
                const t = (now - start) / 1000;
                const theta = t * speed * 0.2; // flow direction, one turn per ~30s at speed 1
                const ux = Math.cos(theta);
                const uy = Math.sin(theta);
                const slide = t * speed * 45; // px the field has travelled
                warp.transform((p: number[]) => {
                    const ox = p[2], oy = p[3];
                    // sample the field in the frame that slides with the current
                    const sx = ox - ux * slide;
                    const sy = oy - uy * slide;
                    const a = sx * k1, b = sy * k1 * 0.8;
                    const c = (sx + sy) * k2 + 1.7;
                    const d = (sx - sy * 0.6) * k3 - t * speed * 0.3;
                    // ∇ψ for ψ = sin a·cos b + 0.6·sin c + 0.5·sin d, scaled by 1/k1
                    const gx = Math.cos(a) * Math.cos(b) + 0.6 * (k2 / k1) * Math.cos(c) + 0.5 * (k3 / k1) * Math.cos(d);
                    const gy = -0.8 * Math.sin(a) * Math.sin(b) + 0.6 * (k2 / k1) * Math.cos(c) - 0.3 * (k3 / k1) * Math.cos(d);
                    // the curl: along the streamlines of ψ
                    return [ox + amplitude * gy, oy - amplitude * gx, ox, oy];
                });
                raf = requestAnimationFrame(frame);
            }
            raf = requestAnimationFrame(frame);
            return () => cancelAnimationFrame(raf);
        } else if (mode === 'wave' || mode === 'jelly') {
            const w = tileW * tilesX;
            const h = tileH * tilesY;
            const base = createPointsArray(w, h, complexity, buffer);
            let pts = base.map(p => [...p]);

            warpIt(warp, pts);
            warpReposition(warp, pts);

            const animate = animateFor(mode, amplitude, speed, period);
            if (!animate) return;

            // The slide-in (techpixel/portfolio's warp-in): the shape starts just past its
            // right edge, out of view, and glides back over `slideIn` ms on a long ease-out
            // (fast in, no halt at the end). Skipped under reduced motion.
            const slideFrom =
                slideIn > 0 && !matchMedia('(prefers-reduced-motion: reduce)').matches ? w * SLIDE_FROM : 0;
            const easeOut = (p: number) => 1 - (1 - p) ** 4;
            const shiftAt = (now: number) =>
                slideFrom && slideFrom * (1 - easeOut(Math.min(1, (now - start) / slideIn)));
            // How fast the slide carries the ripples along the shape (rad/s): the ease-out's
            // slope, in wave phase.
            const slideRate = (now: number) => {
                const p = (now - start) / slideIn;
                return slideFrom && p < 1 ? ((slideFrom / period) * 4 * (1 - p) ** 3) / (slideIn / 1000) : 0;
            };
            pts = animate(base, 0, shiftAt(performance.now()));
            warpReposition(warp, pts);

            // The ambient wave takes over as the slide-in slows: its clock only makes up what
            // the slide falls short of `speed`, so the ripples never stall between the two,
            // they just settle from the slide's pace to the ambient one.
            let t = 0;
            let last = start;
            function frame(now: number) {
                if (isHidden()) {
                    // With speed 0 a hidden one (the phone headline on desktop) has nothing
                    // left to move once the slide is over: land it and stop, rather than
                    // checking its visibility every frame for as long as the page is open.
                    if (speed === 0 && now - start >= slideIn) {
                        warpReposition(warp, animate!(base, t, 0));
                        return;
                    }
                    raf = requestAnimationFrame(frame);
                    return;
                }
                const dt = Math.max(0, now - last) / 1000;
                last = now;
                if (speed) t += dt * Math.max(0, 1 - slideRate(now) / speed);
                pts = animate!(base, t, shiftAt(now));
                warpReposition(warp, pts);
                // With speed 0 nothing moves once the slide has landed, so stop drawing.
                if (speed === 0 && now - start >= slideIn) return;
                raf = requestAnimationFrame(frame);
            }
            raf = requestAnimationFrame(frame);
        } else {
            return;
        }

        return () => cancelAnimationFrame(raf);
    });
</script>

<div bind:this={host} class={className} {style}></div>
