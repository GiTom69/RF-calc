// Batch 2 reference tests (loaded by test/test.js)
module.exports = function (T) {
  const { ok, near, byId, A } = T;
  // absolute check for values near 0 (dB); test.js provides it as T.nearAbs
  const nearAbs = T.nearAbs || ((a, b, tol, name) => ok(Math.abs(a - b) <= tol, name, a + ' vs ' + b));
  const fn = name => T.evalIn(name);

  // ---------------------------------------------------------- two-tone IP3
  {
    const c = byId('ip3'); const st = A.calcInit(c);
    near(st.vals.pout, -5, 1e-12, 'ip3: Pout = Pin + G');
    near(st.vals.dim, 55, 1e-12, 'ip3: ΔIM3');
    near(st.vals.oip3, 22.5, 1e-12, 'ip3: OIP3 = Pout + ΔIM/2');
    near(st.vals.iip3, 7.5, 1e-12, 'ip3: IIP3 = Pin + ΔIM/2');
    near(st.vals.oip2, 60, 1e-12, 'ip3: OIP2 = Pout + ΔIM2');
    near(st.vals.iip2, 45, 1e-12, 'ip3: IIP2');
    const fl = 10 * Math.log10(1.380649e-23 * 290 * 1000) + 60 + 5;
    near(st.vals.floor, fl, 1e-12, 'ip3: MDS = kTB·F at T = 290 K');
    near(st.vals.sfdr, 2 / 3 * (7.5 - fl), 1e-12, 'ip3: SFDR = 2/3 (IIP3 - floor)');
    A.calcEdit(c, st, 'iip3', 10);
    ok(st.status.pim3 === 'calc', 'ip3: entering IIP3 predicts the IM3 level', JSON.stringify(st.status));
    near(st.vals.pim3, -65, 1e-12, 'ip3: IM3 for IIP3 = 10 dBm at -20 dBm in');
  }
  // noise floor k(T + Te)B, Te = 290(F - 1): NF is referred to 290 K, not to the source temperature
  {
    const c = byId('ip3'); const st = A.calcInit(c);
    const kB = 1.380649e-23, N = (t, nf) => 10 * Math.log10(kB * (t + 290 * (Math.pow(10, nf / 10) - 1)) * 1e6 * 1000);
    A.calcEdit(c, st, 't', 50); A.calcEdit(c, st, 'nf', 1);
    nearAbs(st.vals.floor, -117.627, 1e-3, 'ip3: floor k(T + Te)B at T = 50 K, NF 1 dB, 1 MHz = -117.63 dBm');
    near(st.vals.floor, N(50, 1), 1e-12, 'ip3: floor at a cold source matches k(T + Te)B');
    near(st.vals.sfdr, 2 / 3 * (st.vals.iip3 - N(50, 1)), 1e-12, 'ip3: SFDR uses the k(T + Te)B floor');
    A.calcEdit(c, st, 't', 1000); A.calcEdit(c, st, 'nf', 3);
    near(st.vals.floor, N(1000, 3), 1e-12, 'ip3: floor at a hot source (1000 K, NF 3 dB)');
    A.calcEdit(c, st, 't', 0);
    near(st.vals.floor, N(0, 3), 1e-12, 'ip3: T = 0 K is a valid source temperature (floor = k·Te·B)');
    // closed-form inverses
    const inv = c.eqs.find(e => e.out === 'floor').inv;
    near(inv.nf({ floor: N(50, 2), bw: 1e6, t: 50 }), 2, 1e-9, 'ip3: closed-form NF inverse of k(T + Te)B');
    near(inv.t({ floor: N(50, 2), bw: 1e6, nf: 2 }), 50, 1e-9, 'ip3: closed-form T inverse of k(T + Te)B');
    near(inv.bw({ floor: N(50, 2) + 10, nf: 2, t: 50 }), 1e7, 1e-9, 'ip3: closed-form B inverse of k(T + Te)B');
    ok(isNaN(inv.nf({ floor: N(50, 0) - 1, bw: 1e6, t: 50 })), 'ip3: a floor below kTB of the source has no NF (NaN)');
    ok(isNaN(inv.t({ floor: N(0, 5) - 1, bw: 1e6, nf: 5 })), 'ip3: a floor below k·Te·B has no source temperature (NaN)');
    nearAbs(inv.nf({ floor: N(290, 0), bw: 1e6, t: 290 }), 0, 1e-9, 'ip3: floor = kTB gives NF = 0 dB');
    // solver: entering the floor at a cold source solves NF back
    const s2 = A.calcInit(c);
    A.calcEdit(c, s2, 't', 50); A.calcEdit(c, s2, 'bw', 1e6); A.calcEdit(c, s2, 'floor', N(50, 2));
    ok(s2.status.nf === 'calc', 'ip3: entering T, B and the floor solves NF', JSON.stringify(s2.status));
    near(s2.vals.nf, 2, 1e-9, 'ip3: NF solved from a cold-source floor');
    // round-trip edge cases: NF = 0 and T = 0 must survive floating-point rounding of the floor
    for (const t0 of [290, 1, 5, 500]) {
      const s3 = A.calcInit(c);
      A.calcEdit(c, s3, 't', t0); A.calcEdit(c, s3, 'nf', 0); A.calcEdit(c, s3, 'nf', NaN);
      ok(s3.status.nf === 'calc' && isFinite(s3.vals.nf), 'ip3: NF = 0 then cleared re-solves NF at T = ' + t0 + ' K', JSON.stringify(s3.status) + ' ' + s3.vals.nf);
      nearAbs(s3.vals.nf, 0, 1e-9, 'ip3: NF = 0 round-trips through the floor at T = ' + t0 + ' K');
    }
    for (const nf0 of [0.5, 2, 5]) {
      const tv = inv.t({ floor: N(0, nf0), bw: 1e6, nf: nf0 });
      ok(isFinite(tv) && tv >= 0, 'ip3: floor at T = 0 K solves T = 0 (not NaN, not negative) for NF ' + nf0 + ' dB', String(tv));
      nearAbs(tv, 0, 1e-6, 'ip3: T = 0 K round-trips for NF ' + nf0 + ' dB');
    }
  }
  // ------------------------------------------------------------------ ADC
  {
    const c = byId('adc'); const st = A.calcInit(c);
    near(st.vals.snrq, 74.0081, 1e-5, 'adc: 12-bit ideal SNR 74.01 dB');
    near(st.vals.enob, (68 - 1.76091) / 6.0206, 1e-5, 'adc: ENOB from SINAD 68 dB');
    near(st.vals.pg, 16.9897, 1e-5, 'adc: processing gain 100 MS/s, 1 MHz');
    near(st.vals.snrb, 84.9897, 1e-5, 'adc: SNR in band');
    near(st.vals.nsd, 10 - 68 - 76.9897, 1e-5, 'adc: noise density dBm/Hz');
    A.calcEdit(c, st, 'snrq', 98);
    near(st.vals.n, (98 - 1.76091) / 6.0206, 1e-5, 'adc: bits for 98 dB ideal SNR');
    ok(fn('b2NyqZone(70e6, 100e6)') === 2 && fn('b2Alias(70e6, 100e6)') === 30e6, 'adc: 70 MHz at 100 MS/s is zone 2, alias 30 MHz');
    ok(fn('b2NyqZone(30e6, 100e6)') === 1 && fn('b2Alias(130e6, 100e6)') === 30e6 && fn('b2Alias(170e6, 100e6)') === 30e6, 'adc: alias in zones 1, 3, 4');
    near(fn('-dbv(2 * PI * 100e6 * 1e-12)'), 64.0364, 1e-5, 'adc: 1 ps jitter at 100 MHz limits SNR to 64.04 dB');
  }
  // ---------------------------------------------------------- phase noise
  {
    const I = fn('b2PnIntegrate([[1e3, -100], [1e6, -100]], 1e3, 1e6)');
    near(I.p, 1e-10 * 999000, 1e-12, 'pn: flat -100 dBc/Hz over 1 kHz-1 MHz');
    near(fn('b2PnIntegrate([[1e3, -80], [1e6, -140]], 1e3, 1e6).p'), 1e-2 * (1 / 1e3 - 1 / 1e6), 1e-12, 'pn: -20 dB/dec segment (power law)');
    near(fn('b2PnIntegrate([[1e3, -90], [1e6, -120]], 1e3, 1e6).p'), 1e-6 * Math.log(1000), 1e-12, 'pn: -10 dB/dec segment (log form)');
    near(fn('b2PnIntegrate([[1e3, -100], [1e6, -100]], 1e4, 1e5).p'), 1e-10 * 9e4, 1e-12, 'pn: partial range inside one segment');
    ok(fn('b2PnIntegrate([[1e3, -100], [1e6, -100]], 100, 1e7).clipped') === true, 'pn: limits beyond the table are flagged');
    const r = fn('b2PnResults(1e-10 * 999000, 1e9)');
    near(r.phiRad, Math.sqrt(2 * 9.99e-5), 1e-12, 'pn: RMS phase error = sqrt(2 ∫L)');
    near(r.jitter, 2.24967e-12, 1e-5, 'pn: jitter at 1 GHz');
    near(r.phiDeg, 0.809879, 1e-5, 'pn: phase error in degrees');
    near(r.jitter, r.phiRad / (2 * Math.PI * 1e9), 1e-12, 'pn: jitter = phi / (2 pi f0)');
    near(fn('b2PnAt([[1e3, -80], [1e5, -120]], 1e4)'), -100, 1e-12, 'pn: log-log interpolation');
    // the crosshair converts log10 back with 10^x, which lands a hair outside the table ends
    const edge = fn('[2.5e3, 3.3e3, 47e3, 12.345e3].map(f => b2PnAt([[f, -80], [1e6, -100]], Math.pow(10, Math.log10(f))))');
    ok(edge.every(x => x === -80), 'pn: L(f) at the first table offset survives 10^log10 round-off', edge);
    near(fn('b2PnAt([[1e3, -80], [12.345e3, -100]], Math.pow(10, Math.log10(12.345e3)))'), -100, 1e-12, 'pn: L(f) at the last table offset survives round-off');
    ok(isNaN(fn('b2PnAt([[1e3, -80], [1e6, -100]], 999)')), 'pn: L(f) outside the table is still NaN');
    // large phase error: small-angle EVM is flagged, Gaussian EVM stays below 141 %
    const big = fn('b2PnResults(100, 1e9)');
    ok(big.large === true && big.evmGauss < 100 * Math.SQRT2 + 1e-9 && big.evm > 1000, 'pn: phi = 14 rad is flagged; Gaussian EVM <= 141 %', JSON.stringify(big));
    near(fn('b2PnResults(0.5, 1e9).evmGauss'), 100 * Math.sqrt(2 * (1 - Math.exp(-0.5))), 1e-12, 'pn: Gaussian EVM at phi = 1 rad');
    near(fn('b2PnResults(0.5, 1e9).evmGauss'), 88.7096, 1e-5, 'pn: Gaussian EVM at phi = 1 rad is 88.7 %');
    ok(r.large === false && Math.abs(r.evmGauss - r.evm) < 1e-4 * r.evm, 'pn: small phi: Gaussian EVM equals the small-angle EVM');
  }
  // ---------------------------------------------------------- spur table
  {
    const rows = fn("b2Products({ rf1: 2400e6, rf2: 2483.5e6, lo1: 2330e6, lo2: 2330e6, if1: 70e6, if2: 153.5e6, N: 5, desired: 'down' })");
    ok(rows.length === 30, 'spurs: 30 products up to order 5', rows.length);
    ok(rows[0].kind === 'desired' && rows[0].inband, 'spurs: wanted product first and in band');
    const hits = rows.filter(r => r.inband && r.kind !== 'desired').map(r => r.m + ',' + r.n);
    ok(hits.length === 1 && hits[0] === '2,-2', 'spurs: only 2RF-2LO lands in the IF band', hits);
    const r22 = rows.find(r => r.m === 2 && r.n === -2);
    near(r22.f1, 140e6, 1e-12, 'spurs: 2RF-2LO range start'); near(r22.f2, 307e6, 1e-12, 'spurs: 2RF-2LO range end');
    // order 1 cannot contain the wanted RF ± LO (order 2): the UI requires N >= 2
    ok(!fn("b2Products({ rf1: 5.7e9, rf2: 5.9e9, lo1: 4.5e9, lo2: 4.7e9, if1: 1.1e9, if2: 1.3e9, N: 1, desired: 'down' })").some(r => r.kind === 'desired'), 'spurs: order 1 has no wanted product');
    ok(fn("b2Products({ rf1: 5.7e9, rf2: 5.9e9, lo1: 4.5e9, lo2: 4.7e9, if1: 1.1e9, if2: 1.3e9, N: 2, desired: 'down' })")[0].kind === 'desired', 'spurs: order 2 has the wanted product');
    const cross = fn('b2Range(1, -1, 90, 110, 100, 100)');
    ok(cross[0] === 0 && cross[1] === 10, 'spurs: range through zero folds to [0, max]', cross);
  }
  // ------------------------------------------------------------ LC filter
  {
    const g = (r, n, rp) => fn("b2FilterG('" + r + "', " + n + ', ' + (rp || 0) + ')');
    const close = (a, b, tol) => a.length === b.length && a.every((x, i) => Math.abs(x - b[i]) < tol);
    ok(close(g('butter', 3), [1, 1, 2, 1, 1], 1e-12), 'filter: Butterworth N=3 g = 1, 2, 1');
    ok(close(g('cheby', 3, 0.5), [1, 1.5963, 1.0967, 1.5963, 1], 1e-4), 'filter: Chebyshev 0.5 dB N=3', g('cheby', 3, 0.5));
    ok(close(g('cheby', 5, 0.5), [1, 1.7058, 1.2296, 2.5408, 1.2296, 1.7058, 1], 2e-4), 'filter: Chebyshev 0.5 dB N=5', g('cheby', 5, 0.5));
    ok(close(g('cheby', 4, 0.5), [1, 1.6703, 1.1926, 2.3661, 0.8419, 1.9841], 2e-4), 'filter: Chebyshev 0.5 dB N=4 with g5 = 1.9841', g('cheby', 4, 0.5));
    ok(fn("b2FilterOrder('butter', 40, 0, 2)") === 7, 'filter: Butterworth order for 40 dB at 2 fc');
    ok(fn("b2FilterOrder('cheby', 40, 0.5, 2)") === 5, 'filter: Chebyshev order for 40 dB at 2 fc');
    ok(fn("b2FilterOrder('butter', 15, 0, 1.5)") === 5, 'filter: Pozar Ex. 8.3 needs N = 5');
    near(fn("b2Filter3dB('cheby', 3, 0.5)"), 1.16749, 1e-5, 'filter: Chebyshev 0.5 dB N=3 -3 dB point');
    // attenuation below the ripple: every order already meets it, N = 1
    ok(fn("b2FilterOrder('cheby', 0.3, 0.5, 2)") === 1, 'filter: Chebyshev order is 1 when A < ripple');
    ok(fn("b2FilterOrder('cheby', 0.5, 0.5, 2)") === 1, 'filter: Chebyshev order is 1 when A = ripple');
    // ripple above 3.01 dB: the -3 dB point lies inside the ripple band
    const cheb = (n, rp, w) => { const e2 = Math.pow(10, rp / 10) - 1, x = w <= 1 ? Math.cos(n * Math.acos(w)) : Math.cosh(n * Math.acosh(w)); return 10 * Math.log10(1 + e2 * x * x); };
    for (const [rp, w] of [[4, 0.97865], [6, 0.94996], [10, 0.91699]]) {
      const w3 = fn("b2Filter3dB('cheby', 3, " + rp + ')');
      near(w3, w, 1e-4, 'filter: Chebyshev ' + rp + ' dB ripple N=3 -3 dB point inside the ripple band');
      nearAbs(cheb(3, rp, w3), 10 * Math.log10(2), 1e-9, 'filter: ' + rp + ' dB ripple: attenuation at the -3 dB point is 3.01 dB');
    }
    nearAbs(fn("b2Filter3dB('cheby', 3, 10 * Math.log10(2))"), 1, 1e-9, 'filter: 3.0103 dB ripple puts the -3 dB point at the ripple edge');
    // wide band-pass (f2/f1 > 5.8) is still exact: 30-200 MHz
    const wb = fn("(() => { const f0 = Math.sqrt(30e6 * 200e6), e = b2BandEdges(f0, 170e6); const d = b2FilterDesign({ resp: 'butter', n: 3, type: 'bpf', f0: f0, bw: 170e6, z0: 50, first: 'shunt' }); return [e[0], e[1], b2FilterResp(d, e[0]).s21, b2FilterResp(d, e[1]).s21]; })()");
    near(wb[0], 30e6, 1e-9, 'filter: wide BPF lower edge 30 MHz'); near(wb[1], 200e6, 1e-9, 'filter: wide BPF upper edge 200 MHz');
    nearAbs(wb[2], -3.0103, 1e-4, 'filter: wide BPF -3.01 dB at 30 MHz'); nearAbs(wb[3], -3.0103, 1e-4, 'filter: wide BPF -3.01 dB at 200 MHz');
    // Pozar Example 8.3: maximally flat LPF, 2 GHz, 50 ohm, N = 5
    const d = fn("b2FilterDesign({ resp: 'butter', n: 5, type: 'lpf', fc: 2e9, z0: 50, first: 'shunt' })");
    near(d.els[0].C, 0.9836e-12, 1e-3, 'filter: Pozar 8.3 C1 = 0.984 pF');
    near(d.els[1].L, 6.438e-9, 1e-3, 'filter: Pozar 8.3 L2 = 6.438 nH');
    near(d.els[2].C, 3.183e-12, 1e-3, 'filter: Pozar 8.3 C3 = 3.183 pF');
    near(fn("b2FilterResp(b2FilterDesign({ resp: 'butter', n: 5, type: 'lpf', fc: 2e9, z0: 50, first: 'shunt' }), 2e9).s21"), -3.0103, 1e-4, 'filter: Butterworth -3.01 dB at fc');
    near(fn("b2FilterResp(b2FilterDesign({ resp: 'butter', n: 5, type: 'lpf', fc: 2e9, z0: 50, first: 'shunt' }), 3e9).s21"), -10 * Math.log10(1 + Math.pow(1.5, 10)), 1e-9, 'filter: Butterworth attenuation at 1.5 fc');
    // Pozar Example 8.4: 0.5 dB Chebyshev BPF, N = 3, 1 GHz, 10 %, 50 ohm (series first)
    const b = fn("b2FilterDesign({ resp: 'cheby', ripple: 0.5, n: 3, type: 'bpf', f0: 1e9, bw: 100e6, z0: 50, first: 'series' })");
    near(b.els[0].L, 127.0e-9, 1e-3, 'filter: Pozar 8.4 L1 = 127.0 nH');
    near(b.els[0].C, 0.1994e-12, 1e-3, 'filter: Pozar 8.4 C1 = 0.199 pF');
    near(b.els[1].L, 0.7256e-9, 1e-3, 'filter: Pozar 8.4 L2 = 0.726 nH');
    near(b.els[1].C, 34.91e-12, 1e-3, 'filter: Pozar 8.4 C2 = 34.91 pF');
    const ed = fn('b2BandEdges(1e9, 100e6)');
    near(ed[0] * ed[1], 1e18, 1e-12, 'filter: band edges are geometric about f0');
    nearAbs(fn("b2FilterResp(b2FilterDesign({ resp: 'cheby', ripple: 0.5, n: 3, type: 'bpf', f0: 1e9, bw: 100e6, z0: 50, first: 'series' }), " + ed[1] + ').s21'), -0.5, 1e-4, 'filter: Chebyshev BPF ripple at the band edge');
    // even-order Chebyshev: load g5 and ripple at DC
    const c4 = fn("b2FilterDesign({ resp: 'cheby', ripple: 0.5, n: 4, type: 'lpf', fc: 1e9, z0: 50, first: 'shunt' })");
    near(c4.rl, 50 / 1.98406, 1e-4, 'filter: even-order Chebyshev load = Z0 / g5');
    nearAbs(fn("b2FilterResp(b2FilterDesign({ resp: 'cheby', ripple: 0.5, n: 4, type: 'lpf', fc: 1e9, z0: 50, first: 'shunt' }), 1e6).s21"), -0.5, 1e-4, 'filter: even-order Chebyshev ripple at DC');
    // HPF and BSF edges
    near(fn("b2FilterResp(b2FilterDesign({ resp: 'butter', n: 4, type: 'hpf', fc: 1e9, z0: 50, first: 'series' }), 1e9).s21"), -3.0103, 1e-4, 'filter: Butterworth HPF -3.01 dB at fc');
    const e2 = fn('b2BandEdges(1e9, 200e6)');
    near(fn("b2FilterResp(b2FilterDesign({ resp: 'butter', n: 3, type: 'bsf', f0: 1e9, bw: 200e6, z0: 50, first: 'shunt' }), " + e2[0] + ').s21'), -3.0103, 1e-4, 'filter: Butterworth BSF -3.01 dB at the stop-band edge');
    ok(fn("b2FilterResp(b2FilterDesign({ resp: 'butter', n: 3, type: 'bsf', f0: 1e9, bw: 200e6, z0: 50, first: 'shunt' }), 1e9).s21") < -100, 'filter: band-stop notch at f0');
    // E-series snapping keeps the structure
    const sn = fn("b2FilterSnap(b2FilterDesign({ resp: 'butter', n: 5, type: 'lpf', fc: 2e9, z0: 50, first: 'shunt' }), 'E24')");
    ok(Math.abs(sn.els[0].C - 1.0e-12) < 1e-18 && Math.abs(sn.els[1].L - 6.2e-9) < 1e-15, 'filter: E24 snapping 1.0 pF / 6.2 nH', [sn.els[0].C, sn.els[1].L]);
  }
};
