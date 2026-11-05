// Batch 1 reference tests (values from the independent verification pass:
// mpmath / scipy / Monte Carlo). Run via: node test/test.js --only=b1
module.exports = function (T) {
  const { ok, byId, A } = T;
  const F = name => T.evalIn(name);
  // near: relative tolerance; abs / nearAbs: absolute (dB values and others that can be near 0)
  const near = T.nearAbs ? T.near : (a, b, tol, name) => ok(b === 0 ? Math.abs(a) <= tol : Math.abs(a - b) <= tol * Math.abs(b), name, a + ' vs ' + b);
  const abs = (a, b, tol, name) => ok(Math.abs(a - b) <= tol, name, a + ' vs ' + b);
  const nearAbs = T.nearAbs || abs;
  const erfc = F('b1Erfc'), berOf = F('b1BerOf'), ebnoFor = F('b1EbnoForBer'), esnoFor = F('b1EsnoForSer'), serOf = F('b1SerOf');

  // ---------------------------------------------------------------- erfc
  [[0.5, 0.47950012218695346], [1, 0.15729920705028513], [2, 4.6777349810472658e-3], [4, 1.5417257900280019e-8],
   [6, 2.1519736712498913e-17], [10, 2.0884875837625448e-45], [20, 5.3958656116079009e-176], [26, 5.6631924088561428e-296],
   [-1, 1.8427007929497149]].forEach(([x, y]) => near(erfc(x), y, 1e-14, 'erfc(' + x + ')'));
  ok(erfc(27) === 0, 'erfc underflows to 0 beyond 26.54');

  // ------------------------------------------ required Eb/N0 for a BER
  const REQ = {
    bpsk: [6.7895, 10.5298, 12.5495], qpsk: [6.7895, 10.5298, 12.5495], '8psk': [10.0102, 13.9496, 16.0251],
    '16psk': [14.3467, 18.4410, 20.5581], '16qam': [10.5224, 14.4017, 16.4608], '64qam': [14.7675, 18.7772, 20.8719],
    '256qam': [19.3838, 23.5146, 25.6412], '1024qam': [24.2607, 28.5033, 30.6586], '4096qam': [29.3228, 33.6682, 35.8492],
    // cross QAM: exact BER of the quasi-Gray labelling (was SER/k, which is 0.03 to 0.12 dB optimistic)
    '32qam': [12.5028, 16.4168, 18.4854], '128qam': [17.0130, 21.0173, 23.1105], '512qam': [21.7456, 25.8808, 28.0085],
    '2048qam': [26.6958, 30.9537, 33.1129],
  };
  for (const id in REQ) [1e-3, 1e-6, 1e-9].forEach((b, i) => abs(ebnoFor(id, b), REQ[id][i], 1.5e-4, id + ': Eb/N0 for BER ' + b));
  abs(ebnoFor('bpsk', 1e-12), 13.9343, 1.5e-4, 'bpsk: Eb/N0 for BER 1e-12');
  abs(ebnoFor('4096qam', 1e-12), 37.3080, 1.5e-4, '4096qam: Eb/N0 for BER 1e-12');
  near(berOf('bpsk', 9.5874), 1.0010e-5, 2e-4, 'BPSK at 9.5874 dB is 1e-5');

  // --------------------------------------------------- forward BER table
  const FWD = {
    bpsk: [7.8650e-2, 5.9539e-3, 3.8721e-6, 9.1240e-16, 1.0442e-45, 7.3070e-140],
    '8psk': [1.2269e-1, 3.1861e-2, 1.0114e-3, 4.5161e-8, 2.3324e-21, 7.3146e-63],
    '16psk': [1.7446e-1, 8.2917e-2, 2.0249e-2, 4.7894e-4, 8.5726e-9, 2.4862e-23],
    '16qam': [1.4098e-1, 4.1893e-2, 1.7542e-3, 1.8419e-7, 1.4040e-19, 2.1794e-57],
    '64qam': [1.9984e-1, 1.0079e-1, 2.6533e-2, 7.7247e-4, 2.6339e-8, 5.8178e-22],
    '256qam': [2.5461e-1, 1.5935e-1, 7.8596e-2, 1.9803e-2, 5.0531e-4, 1.1445e-8],
    '1024qam': [2.9094e-1, 2.1482e-1, 1.3346e-1, 6.5738e-2, 1.6820e-2, 4.5044e-4],
    '4096qam': [3.1646e-1, 2.5328e-1, 1.8644e-1, 1.1645e-1, 5.7959e-2, 1.5659e-2],
  };
  for (const id in FWD) FWD[id].forEach((b, i) => near(berOf(id, 5 * i), b, 1e-4, id + ': BER at ' + 5 * i + ' dB'));
  near(berOf('4096qam', 30), 4.9659e-4, 1e-4, '4096qam: BER at 30 dB');
  near(berOf('1024qam', 30), 1.1855e-8, 1e-4, '1024qam: BER at 30 dB');
  // cross QAM (exact for the labelling; Monte Carlo with ML detection agrees within 0.3 %: 32-cross 4 dB 9.248e-2, 10 dB 8.905e-3,
  // 128-cross 4 dB 1.5846e-1, 12 dB 2.939e-2, 512-cross 15 dB 4.39e-2)
  [8.89062e-3, 2.44933e-5, 5.38111e-13, 1.02288e-36].forEach((b, i) => near(berOf('32qam', 10 + 5 * i), b, 1e-4, '32qam: BER at ' + (10 + 5 * i) + ' dB'));
  [5.60297e-2, 5.93380e-3, 1.05974e-5, 5.93710e-14].forEach((b, i) => near(berOf('128qam', 10 + 5 * i), b, 1e-4, '128qam: BER at ' + (10 + 5 * i) + ' dB'));
  [[4, 2.15190e-1], [10, 1.11309e-1], [15, 4.38080e-2], [20, 4.53871e-3], [25, 7.62838e-6]].forEach(([e, b]) => near(berOf('512qam', e), b, 1e-4, '512qam: BER at ' + e + ' dB'));
  [[4, 2.56445e-1], [10, 1.66606e-1], [20, 3.71470e-2], [25, 4.11541e-3]].forEach(([e, b]) => near(berOf('2048qam', e), b, 1e-4, '2048qam: BER at ' + e + ' dB'));
  near(berOf('32qam', 4), 9.27281e-2, 1e-4, '32qam: BER at 4 dB');
  {
    // high SNR: BER -> (bit differences over neighbour pairs)·2/(M·k)·Q(a) (independent of the cell sums)
    const Q = F('b1Q');
    for (const [M, nn] of [[32, 56], [128, 264], [512, 1072], [2048, 4256]]) {
      const k = Math.log2(M), a = Math.sqrt(3 * k * Math.pow(10, 3) / (31 * M / 32 - 1));
      near(berOf(M + 'qam', 30), 2 * nn / (M * k) * Q(a), 1e-6, M + '-cross: high-SNR BER = nearest-neighbour Gray penalty × SER/k');
    }
    // the BER is not capped at SER/k ≈ 1/k: denser constellations have the higher BER everywhere on the chart
    const ids = ['bpsk', '16qam', '32qam', '64qam', '128qam', '256qam', '512qam', '1024qam', '2048qam', '4096qam'];
    let bad = '';
    for (let e = -2; e <= 40; e += 0.5) for (let i = 2; i < ids.length; i++) {
      const lo = berOf(ids[i - 1], e), hi = berOf(ids[i], e);
      if (lo > 1e-300 && !(hi >= lo)) bad += ids[i] + ' < ' + ids[i - 1] + ' at ' + e + ' dB; ';
    }
    ok(!bad, 'cross QAM: BER curves keep the order of M from -2 to 40 dB', bad);
    ok(berOf('2048qam', -30) > 0.45 && berOf('32qam', -30) > 0.45, 'cross QAM: BER tends to 0.5 at low SNR (no 1/k cap)', berOf('2048qam', -30));
    abs(ebnoFor('2048qam', 0.1), 14.4730, 1e-3, '2048qam: BER 0.1 is reachable (was NaN)');
  }
  ok(berOf('bpsk', 30) === 0, 'BPSK BER underflows to 0 at 30 dB');
  // Es/N0 for a target SER
  const SERT = { qpsk: [10.3451, 13.7891, 15.7200], '8psk': [15.6782, 19.1220, 21.0529], '16qam': [17.6266, 20.9183, 22.8008],
    '4096qam': [42.1741, 45.3711, 47.2224], '32qam': [20.6924, 23.9556, 25.8288], '128qam': [26.8949, 30.1201, 31.9808] };
  for (const id in SERT) [1e-3, 1e-6, 1e-9].forEach((s, i) => abs(esnoFor(id, s), SERT[id][i], 1.5e-4, id + ': Es/N0 for SER ' + s));
  ok(isNaN(ebnoFor('bpsk', 0.6)), 'BER above 0.5 is unreachable');
  ok(isNaN(ebnoFor('16qam', 0.4999999)), 'BER this close to 0.5 is out of the -60 dB bracket');
  // targets near 0.5 need Eb/N0 below -30 dB: Q(x) = 0.49 at x = 0.0250689, Eb/N0 = 10·log(x²/2)
  abs(ebnoFor('qpsk', 0.49), 10 * Math.log10(0.0250689 * 0.0250689 / 2), 1e-3, 'QPSK: BER 0.49 solves (-35.03 dB, below the old -30 dB bracket)');
  near(berOf('qpsk', ebnoFor('qpsk', 0.49)), 0.49, 1e-7, 'QPSK: BER 0.49 inverse is consistent');
  near(serOf('qpsk', esnoFor('qpsk', 0.74)), 0.74, 1e-7, 'QPSK: SER 0.74 solves (limit 0.75)');
  // M-PSK at low SNR: the integrand steps up within √γs of 0; reference = Simpson with 4e6 intervals
  near(F('b1PskR')(3 * Math.PI / 16, 4e-3), 0.3960482520641128, 1e-8, '16-PSK Pawula integral accurate at -30 dB');
  near(F('b1PskR')(Math.PI / 8, 3e-4), 0.43561334667934315, 1e-8, '8-PSK Pawula integral accurate at -40 dB');

  // BER calculator behaviour
  {
    const c = byId('ber'); const st = A.calcInit(c);
    near(st.vals.ber, 3.8721e-6, 1e-4, 'ber calc: QPSK at 10 dB');
    st.cfg.mod = '16qam';
    A.calcEdit(c, st, 'ber', 1e-6);
    ok(st.status.ebno === 'calc', 'ber calc: entering a BER solves Eb/N0', JSON.stringify(st.status));
    abs(st.vals.ebno, 14.4017, 1.5e-4, 'ber calc: 16-QAM needs 14.40 dB for 1e-6');
    abs(st.vals.esno, 14.4017 + 10 * Math.log10(4), 1.5e-4, 'ber calc: Es/N0 = Eb/N0 + 6.02 dB');
    nearAbs(st.vals.snr, st.vals.ebno, 1e-12, 'ber calc: SNR in B = Rb equals Eb/N0');
    A.calcEdit(c, st, 'il', 2);
    abs(st.vals.ebno, 16.4017, 1.5e-4, 'ber calc: implementation loss adds to the required Eb/N0');
    A.calcEdit(c, st, 'ebno', 80);
    ok(st.vals.ber === 0 && st.status.ber === 'calc', 'ber calc: underflowed BER is shown as 0, not an error', st.status.ber + ' ' + st.vals.ber);
    // the row shows Eb/N0 − IL, the value the BER is computed from
    const row = c.outputs.find(o => o.label.includes('implementation loss'));
    ok(/^Effective E<sub>b<\/sub>\/N₀ after the implementation loss/.test(row.label), 'ber calc: Eb/N0 − IL row is labelled as the effective value', row.label);
    A.calcEdit(c, st, 'ebno', 6); A.calcEdit(c, st, 'il', 1.5);
    nearAbs(row.fn(Object.assign({ $: st.cfg }, st.vals)), 4.5, 1e-12, 'ber calc: effective Eb/N0 = 6 − 1.5 dB');
    // cross QAM high BER: solvable now, and the warning no longer claims "0.03 dB optimistic"
    const s2 = A.calcInit(c); s2.cfg.mod = '2048qam';
    A.calcEdit(c, s2, 'ber', 0.1);
    ok(s2.status.ebno === 'calc', 'ber calc: 2048-QAM BER 0.1 solves Eb/N0 (was an error)', JSON.stringify(s2.status));
    const wx = c.warn(Object.assign({ $: s2.cfg }, s2.vals));
    ok(/quasi-Gray/.test(wx) && !/0\.03 dB optimistic/.test(wx), 'ber calc: cross-QAM note describes the exact labelling', wx);
    const s3 = A.calcInit(c);
    A.calcEdit(c, s3, 'ber', 0.4999999);
    ok(/too close to 0\.5/.test(c.warn(Object.assign({ $: s3.cfg }, s3.vals)) || ''), 'ber calc: unreachable BER near 0.5 explains itself', JSON.stringify(s3.vals));
    // regression: the unreachable-SER message quotes the model's own low-SNR limit (cross QAM: 1 − 2/M, not (M−1)/M)
    const s4 = A.calcInit(c); s4.cfg.mod = '32qam';
    A.calcEdit(c, s4, 'ser', 0.95);
    const w4 = c.warn(Object.assign({ $: s4.cfg }, s4.vals)) || '';
    ok(/levels off at 0\.9374/.test(w4) && /1 − 2\/M/.test(w4) && !/\(M−1\)\/M/.test(w4), 'ber calc: unreachable 32-QAM SER 0.95 quotes the Smith limit 0.9375 = 1 − 2/M', w4);
    const s5 = A.calcInit(c); s5.cfg.mod = '16qam';
    A.calcEdit(c, s5, 'ser', 0.9375);
    ok(/levels off at 0\.937/.test(c.warn(Object.assign({ $: s5.cfg }, s5.vals)) || '') && /\(M−1\)\/M/.test(c.warn(Object.assign({ $: s5.cfg }, s5.vals))), 'ber calc: unreachable 16-QAM SER quotes (M−1)/M');
    ok(/Gray penalty about 1\.06 to 1\.14/.test(c.note), 'ber calc: note gives the Gray penalty range of the labellings (1.064 for 2048-cross)');
  }

  // ---------------------------------------------------------------- POI
  const win = F('b1PoiWindow'), stats = F('b1PoiStats'), pois = F('b1PoiPoisson'), bern = F('b1PoiBernoulli');
  const bernMean = F('b1PoiBernoulliMean'), ptime = F('b1PoiPoissonTime'), btime = F('b1PoiBernoulliTime'), binom = F('b1BinomAtLeast');
  {
    const w1 = win('beam', { bw: 3, T: 6 }), w2 = win('sweep', { bif: 10e6, bsig: 0, span: 16e9, T: 0.1 });
    near(w1.tau, 0.05, 1e-12, 'POI: 3° beam with a 6 s scan is on for 50 ms');
    near(w2.tau, 62.5e-6, 1e-12, 'POI: swept receiver dwell 62.5 µs');
    const s = stats([w1, w2], 0);
    near(s.lam, 0.0834375, 1e-9, 'POI ex1: lambda');
    near(1 / s.lam, 11.985, 1e-4, 'POI ex1: mean time');
    near(pois(s.lam, 10), 0.56585, 1e-4, 'POI ex1: Poisson 10 s');
    near(pois(s.lam, 60), 0.99330, 1e-4, 'POI ex1: Poisson 60 s');
    near(ptime(s.lam, 0.9), 27.597, 1e-4, 'POI ex1: T90');
    near(ptime(s.lam, 0.99), 55.193, 1e-4, 'POI ex1: T99');
    near(s.p, 0.500625, 1e-9, 'POI ex1: per-scan p');
    near(bern(s.p, s.Tmax, 10), 0.6673, 1e-3, 'POI ex1: per-scan 10 s');
    near(bern(s.p, s.Tmax, 60), 0.9990, 1e-3, 'POI ex1: per-scan 60 s');
    near(bernMean(s.p, s.Tmax), 8.985, 1e-3, 'POI ex1: per-scan mean time');
    const tb = btime(s.p, s.Tmax, 0.9);
    near(bern(s.p, s.Tmax, tb), 0.9, 1e-9, 'POI ex1: per-scan time for 90 % is consistent');
    ok(F('b1PoiWarnings')([w1, w2], s).some(x => x.includes('Poisson model is unreliable')), 'POI ex1: warns about the Poisson model');
    ok(F('b1PoiWarnings')([w1, w2], s).some(x => x.includes('commensurate')), 'POI ex1: warns that 6 s / 0.1 s are commensurate');
  }
  {
    const w1 = win('beam', { bw: 1.5, T: 4 }), w2 = win('step', { dwell: 1e-3, span: 16e9, step: 20e6 });
    near(w2.T, 0.8, 1e-12, 'POI ex2: stepped receiver revisit 800 × 1 ms');
    const s = stats([w1, w2], 0), so = stats([w1, w2], 0.5e-3);
    near(s.lam, 0.00552083, 1e-5, 'POI ex2: lambda');
    near(so.lam, 0.00520833, 1e-5, 'POI ex2: lambda with 0.5 ms minimum overlap');
    near(1 / s.lam, 181.13, 1e-4, 'POI ex2: mean time');
    near(1 / so.lam, 192.00, 1e-4, 'POI ex2: mean time with overlap');
    near(pois(s.lam, 10), 0.05371, 1e-3, 'POI ex2: Poisson 10 s');
    near(pois(so.lam, 10), 0.05075, 1e-3, 'POI ex2: Poisson 10 s with overlap');
    near(pois(s.lam, 60), 0.28197, 1e-4, 'POI ex2: Poisson 60 s');
    near(pois(so.lam, 60), 0.26838, 1e-4, 'POI ex2: Poisson 60 s with overlap');
    near(ptime(s.lam, 0.9), 417.07, 1e-4, 'POI ex2: T90');
    near(s.p, 0.0220833, 1e-5, 'POI ex2: per-scan p');
    near(bern(s.p, s.Tmax, 10), 0.0542, 2e-3, 'POI ex2: per-scan 10 s');
    near(bern(s.p, s.Tmax, 60), 0.2846, 1e-3, 'POI ex2: per-scan 60 s');
    near(bernMean(s.p, s.Tmax), 179.1, 1e-3, 'POI ex2: per-scan mean time');
    const w3 = win('rxant', { bw: 30, T: 2.3 });
    const s3 = stats([w1, w2, w3], 0);
    near(s3.lam, 4.62334e-4, 1e-5, 'POI 3 windows: lambda');
    near(1 / s3.lam, 2162.9, 1e-4, 'POI 3 windows: mean time');
    near(pois(s3.lam, 60), 0.02736, 1e-3, 'POI 3 windows: Poisson 60 s');
    ok(stats([w1, w2], 0.05).lam === 0, 'POI: overlap longer than an on-time means no intercept');
  }
  {
    near(binom(100, 1 / 2320, 1), 0.0421966, 1e-5, 'hops: P(>=1 of 100)');
    near(binom(1000, 1 / 2320, 1), 0.350224, 1e-5, 'hops: P(>=1 of 1000)');
    near(binom(1000, 1 / 2320, 3), 0.00967435, 1e-4, 'hops: P(>=3 of 1000)');
    near(binom(50, 0.01, 1), 0.394994, 1e-5, 'hops: P(>=1 of 50), p = 1/100');
    near(binom(50, 0.01, 5), 1.45689e-4, 1e-4, 'hops: P(>=5 of 50), p = 1/100');
    const hw = win('hop', { rate: 100, nch: 2320 });
    near(hw.tau, 0.01, 1e-12, 'hop window: tau = dwell');
    near(hw.T, 23.2, 1e-12, 'hop window: mean period dwell/p');
    const sh = stats([hw], 0);
    ok(isNaN(sh.p), 'hop-only: per-scan model does not apply');
    near(pois(sh.lam, 10), binom(1000, 1 / 2320, 1), 1e-3, 'hop-only: Poisson matches the binomial P(>=1 of 1000)');
    // with the dwell in progress at t = 0 the hop-only model is exact: 1 + T·rate independent dwells
    near(F('b1PoiAt')(sh, false, 10), 1 - Math.pow(1 - 1 / 2320, 1001), 1e-12, 'hop-only: POI = 1 − (1 − p)^(1 + T·rate)');
    // F4: (1 − p)^n underflows for large n·p; summing from the mode keeps the tail (lgamma/log-space references)
    near(binom(1e4, 0.1, 1000), 0.50488, 1e-4, 'binomial: n = 1e4, p = 0.1, k = 1000 (was 1)');
    near(binom(1e4, 0.1, 1100), 5.299e-4, 1e-3, 'binomial: k = 1100 above the mean (was 1)');
    near(binom(1e6, 0.01, 10000), 0.50135, 1e-4, 'binomial: n = 1e6, p = 0.01');
    near(binom(1e6, 1e-3, 1200), 4.59e-10, 2e-3, 'binomial: 6σ upper tail 4.59e-10');
    near(binom(2e6, 1 / 2320, 862), 0.50547, 1e-4, 'binomial: n = 2e6, p = 1/2320');
    near(binom(1e6, 0.999999, 999999), 0.73576, 1e-4, 'binomial: p close to 1');
    near(binom(64000, 1 / 79, 800), 0.6446, 2e-4, 'binomial: Bluetooth-like 1600 hops/s, 79 channels, 40 s, k = 800');
    // F4 round 2: an endless or huge n must not hang (T_obs = ∞ is a valid typed input)
    {
      const t0 = Date.now();
      ok(binom(Infinity, 0.1, 5) === 1 && binom(Infinity, 1 / 2320, 1) === 1, 'binomial: n = ∞ gives 1 (was an endless loop)');
      ok(binom(1e18, 0.5, 10) === 1 && binom(1e300, 1e-3, 5) === 1, 'binomial: n = 1e18 and 1e300 return');
      near(binom(1e18, 0.5, 5e17 + 1e9), F('b1Q')(2 - 1e-9), 1e-6, 'binomial: n = 1e18 at +2σ uses the normal limit');
      // continuity across the σ = 1e5 switch between the exact sum and the normal limit
      for (const z of [0, 1, 3, 6]) near(binom(3.99e10, 0.5, 3.99e10 / 2 + z * Math.sqrt(3.99e10 / 4)), binom(4.01e10, 0.5, 4.01e10 / 2 + z * Math.sqrt(4.01e10 / 4)), 2e-5, 'binomial: exact sum and normal limit agree at σ ≈ 1e5, +' + z + 'σ');
      near(binom(1e4, 0.9, 9050), 0.0486714281, 1e-8, 'binomial: p > 1/2 upper tail via the failures count');
      near(binom(1e4, 0.9, 8900), 0.9995277092, 1e-9, 'binomial: p > 1/2 lower tail');
      ok(Date.now() - t0 < 2000, 'binomial: large-n cases are fast', Date.now() - t0 + ' ms');
    }
  }

  // POI model fixes, each checked against a Monte Carlo of random phases (verification pass)
  {
    const at = F('b1PoiAt'), timeTo = F('b1PoiTimeTo'), meanT = F('b1PoiMeanTime'), warns = F('b1PoiWarnings');
    // F1: hopper + rotating antenna. The hop has ~20 trials per antenna dwell, so p per scan is 1 − 0.95^20.2, not λ·T = 1.008
    const h20 = [win('hop', { rate: 100, nch: 20 }), win('rxant', { bw: 30, T: 2.3 })], s1 = stats(h20, 0);
    // exact per antenna dwell: 20 or 21 hop dwells touched, 1 − 0.95^20·(1 − 0.1667·0.05)
    near(s1.p, 1 - Math.pow(0.95, 20) * (1 - (30 / 360 * 2.3 * 100 - 19) * 0.05), 1e-12, 'POI F1: per-scan p with a nested hopper is the exact per-dwell probability (0.6445), not a clamped count');
    [[2.3, 0.645], [5, 0.889], [10, 0.988]].forEach(([t, mc]) => nearAbs(at(s1, true, t), mc, 0.006, 'POI F1: hop + antenna per-scan POI at ' + t + ' s vs Monte Carlo ' + mc));
    const s1b = stats([win('hop', { rate: 1000, nch: 100 }), win('rxant', { bw: 30, T: 2.3 })], 0);
    nearAbs(at(s1b, true, 2.3), 0.855, 0.004, 'POI F1: 1000 hops/s, 100 channels at 2.3 s vs Monte Carlo 85.5 %');
    ok(s1.nested[0] && !s1.nested[1], 'POI F1: the hopper is nested in the antenna dwell');
    // F2: three windows, the 10 ms sweep repeats inside the beam/antenna overlap (MC about 10 % per 6 s scan)
    const w3 = [win('beam', { bw: 3, T: 6 }), win('sweep', { bif: 10e6, bsig: 0, span: 16e9, T: 0.01 }), win('rxant', { bw: 30, T: 2.3 })];
    const s2 = stats(w3, 0), tb = 3 / 360 * 6, tr = 30 / 360 * 2.3;
    near(s2.lam, (tr / 2.3) / 6 + (tb / 6) / 2.3, 1e-9, 'POI F2: nested sweep: λ is the beam/antenna overlap rate (0.0175 /s, was 0.0695)');
    nearAbs(at(s2, true, 6), 0.10, 0.01, 'POI F2: per-scan POI in one 6 s scan vs Monte Carlo 10 %');
    const w2txt = warns(w3, s2).join(' ');
    ok(/Window 2 repeats within the on-time/.test(w2txt) && !/prefer the per-scan/.test(w2txt), 'POI F2: nested warning no longer recommends the per-scan result', w2txt);
    // F3: commensurate test uses an absolute tolerance
    const cw = (T1, T2) => { const ws = [win('direct', { tau: 1e-6, T: T1 }), win('direct', { tau: 1e-6, T: T2 })]; return warns(ws, stats(ws, 0)).some(x => x.includes('commensurate')); };
    ok(!cw(6.0317, 1.0131e-3) && !cw(6, 1.37e-3) && !cw(4, 0.47e-3), 'POI F3: large incommensurate period ratios are not flagged');
    ok(cw(6, 0.1) && cw(4, 0.8) && cw(2.3, 0.8) && cw(3, 2) && cw(0.3, 0.1) && cw(2.1, 2) && cw(10, 17e-6), 'POI F3: exact ratios are still flagged (60, 5, 23/8, 3/2, 3, 21/20, 10 s/17 µs)');
    // F5: a hopper's mean period has no fixed phase
    const hw5 = [win('hop', { rate: 100, nch: 2320 }), win('rxant', { bw: 30, T: 2.32 })];
    ok(!warns(hw5, stats(hw5, 0)).some(x => x.includes('commensurate')), 'POI F5: no commensurate warning against a hopping window');
    // F1 round 2: a hopper whose dwell is longer than the antenna/burst on-time is still nested (random phase):
    // p is the exact chance per opening (one dwell, or two when a hop boundary falls inside), not λ·T = 0.75.
    // Monte Carlo (4e5 runs, random phases, periods not locked to the hop clock: a locked grid repeats the same offset)
    const hb = [win('hop', { rate: 100, nch: 2 }), win('burst', { tau: 5e-3, T: 0.05437 })], shb = stats(hb, 0);
    ok(shb.nested[0] && !shb.nested[1], 'POI F1: hopper with a dwell longer than the burst is nested');
    near(shb.p, 0.625, 1e-12, 'POI F1: hop 100/s, 2 ch + 5 ms burst: p = 0.5 + 0.5·0.5·0.5 = 0.625 (was 0.75)');
    [[0.05437, 0.6427], [0.1, 0.8486], [0.2, 0.9758]].forEach(([t, mc]) => nearAbs(at(shb, true, t), mc, 0.012, 'POI F1: hop + burst per-scan POI at ' + t + ' s vs Monte Carlo ' + mc));
    const hs = [win('hop', { rate: 10, nch: 3 }), win('rxant', { bw: 10, T: 1.0437 })], shs = stats(hs, 0);
    near(shs.p, 1 - 2 / 3 * (1 - 10 / 360 * 1.0437 * 10 / 3), 1e-12, 'POI F1: slow hopper 10/s, 3 ch + 10° antenna: p = 0.398 exact (was 0.426)');
    [[1.0437, 0.4030], [3, 0.7703], [10, 0.9931]].forEach(([t, mc]) => nearAbs(at(shs, true, t), mc, 0.006, 'POI F1: slow hopper per-scan POI at ' + t + ' s vs Monte Carlo ' + mc));
    // a coincidence in progress at t = 0 recurs one period later (e ∈ [0, τ]), so it is not counted twice
    for (const sx of [shb, shs, s1]) {
      let mono = true, prev = 0, integ = 0; const T = sx.Tmax, dt = T / 2000;
      for (let t = dt / 2; t < 60 * T; t += dt) { const v = at(sx, true, t); if (v < prev - 1e-12 || v > 1) mono = false; prev = v; integ += (1 - v) * dt; }
      ok(mono, 'POI F1: per-scan POI with P0 is monotonic and ≤ 1 (p = ' + sx.p.toFixed(3) + ')');
      near(meanT(sx, true), integ, 1e-4, 'POI F1: per-scan mean time = ∫(1 − POI) dt with the P0 recurrence (p = ' + sx.p.toFixed(3) + ')');
      near(at(sx, true, timeTo(sx, true, 0.9)), 0.9, 1e-9, 'POI F1: per-scan time for 90 % is consistent (p = ' + sx.p.toFixed(3) + ')');
    }
    const one = stats([win('direct', { tau: 0.2, T: 1 })], 0);
    ok([0.5, 0.8, 0.9, 1, 1.5].every(t => Math.abs(at(one, true, t) - Math.min(1, (0.2 + t) / 1)) < 1e-12), 'POI F1: one window stays exact, POI = min(1, (τ + t)/T)');
    ok(/hops at random/.test(warns(hs, shs).join(' ')), 'POI F1: nested-hopper note for a dwell longer than the on-time');
    // a periodic window nested in a slow hopper still leaves the hopper setting the timing
    const hn = stats([win('hop', { rate: 1, nch: 10 }), win('rxant', { bw: 30, T: 0.1 })], 0);
    ok(!hn.nested[0] && hn.nested[1] && isNaN(hn.p), 'POI F1: an antenna rotating within one dwell is nested in the hopper');
    // F5/G2 round 2: the locked-clock clause is right when other windows are present
    const lockTxt = ws => warns(ws, stats(ws, 0)).find(x => x.includes('commensurate')) || '';
    const f5 = [win('beam', { bw: 3, T: 6 }), win('rxant', { bw: 30, T: 2 }), win('hop', { rate: 100, nch: 2320 })], t5 = lockTxt(f5);
    ok(/P\(ever\) ≤ λ\(1,2\)·6 s = 10\.8 %/.test(t5) && !/intercept happens within that time/.test(t5), 'POI F5: beam + antenna + hopper: bound from the locked pair alone (10.8 %, was 0.0226 %)', t5);
    const e2h = [win('beam', { bw: 1.5, T: 4 }), win('step', { dwell: 1e-3, span: 16e9, step: 20e6 }), win('hop', { rate: 100, nch: 2320 })], t2h = lockTxt(e2h);
    ok(/= 2\.21 %/.test(t2h) && /overlap within that time or never/.test(t2h) && !/intercept happens within/.test(t2h), 'POI G2: ex2 + hopper: P(ever) ≤ 2.21 % for the pair (was 0.00104 %), no 4 s limit on the intercept', t2h);
    // F6: a coincidence in progress at t = 0 counts (exact single window: (τ + T_obs)/T)
    const b1 = [win('direct', { tau: 0.2, T: 1 })], sb = stats(b1, 0);
    near(sb.P0, 0.2, 1e-12, 'POI F6: P0 = Π τ/T');
    near(at(sb, true, 0.3), 0.5, 1e-12, 'POI F6: one window, τ 0.2 s / T 1 s, 0.3 s look: 50 % (was 30 %)');
    near(at(stats([win('direct', { tau: 0.01, T: 1 })], 0), true, 0.05), 0.06, 1e-12, 'POI F6: 10 ms / 1 s, 50 ms look: 6 %');
    const s6 = stats([win('rxant', { bw: 30, T: 2.3 }), win('direct', { tau: 0.3, T: 1.1 })], 0);
    nearAbs(at(s6, true, 1), 0.2165, 0.002, 'POI F6: antenna + burst, 1 s look vs Monte Carlo 21.65 %');
    ok(at(s6, false, 0) === s6.P0 && at(s6, true, 0) === s6.P0, 'POI F6: both models start at P0');
    for (const scan of [true, false]) {
      near(at(s6, scan, timeTo(s6, scan, 0.9)), 0.9, 1e-9, 'POI F6: time for 90 % is consistent (' + (scan ? 'per-scan' : 'Poisson') + ')');
      let integ = 0; const dt = 0.002;   // mean time = ∫(1 − POI) dt
      for (let t = dt / 2; t < 200; t += dt) integ += (1 - at(s6, scan, t)) * dt;
      near(meanT(s6, scan), integ, 1e-4, 'POI F6: mean time = ∫(1 − POI) dt (' + (scan ? 'per-scan' : 'Poisson') + ')');
    }
    // F7: an always-on window adds no phantom openings and does not set T_max
    const s7 = stats([win('rxant', { bw: 360, T: 1 }), win('direct', { tau: 0.01, T: 0.37 })], 0);
    near(s7.lam, 1 / 0.37, 1e-12, 'POI F7: omni antenna + burst: λ = 1/0.37 (was 2.7297)');
    near(s7.Tmax, 0.37, 1e-12, 'POI F7: T_max from the burst, not the omni antenna');
    near(at(s7, true, 0.2), 0.21 / 0.37, 1e-9, 'POI F7: 0.2 s look = (0.01 + 0.2)/0.37 (Monte Carlo 56.7 %, was 20 %)');
    near(stats([win('beam', { bw: 3, T: 6 }), win('sweep', { bif: 1e9, bsig: 0, span: 0.5e9, T: 0.1 })], 0).lam, 1 / 6, 1e-12, 'POI F7: sweep narrower than the IF is always on: λ = 1/6 (was 0.25)');
    ok(/always on/.test(win('rxant', { bw: 360, T: 1 }).info), 'POI F7: always-on window says so');
    const s7c = stats([win('rxant', { bw: 360, T: 2 })], 0);
    ok(s7c.always && at(s7c, false, 1) === 1 && timeTo(s7c, false, 0.99) === 0, 'POI F7: every window always on gives POI 100 % at once');
    // G2-G6: the commensurate warning puts the usual free-running case first and gives the repeat time
    const e2 = [win('beam', { bw: 1.5, T: 4 }), win('step', { dwell: 1e-3, span: 16e9, step: 20e6 })];
    const t2 = warns(e2, stats(e2, 0)).find(x => x.includes('commensurate')) || '';
    ok(/free-running clocks \(the usual case\)/.test(t2) && /repeats every 4 s/.test(t2), 'POI ex2: commensurate warning explains locked vs free-running clocks', t2);
    ok(/intercept happens within that time or never \(P\(ever\) ≤ λ·4 s = 2\.21 %\)/.test(t2), 'POI ex2: two locked windows alone: intercept within 4 s or never, P(ever) ≤ 2.21 % (Monte Carlo 2.22 %)', t2);
    // ex3: three gating windows, so a pair's 4 s / 18.4 s repeat does not limit the intercept (Monte Carlo: most intercepts come later)
    const e3 = e2.concat([win('rxant', { bw: 30, T: 2.3 })]), t3 = warns(e3, stats(e3, 0)).filter(x => x.includes('commensurate'));
    ok(t3.length === 2 && t3.every(x => !/intercept happens within/.test(x) && /intercept can only happen during those overlaps/.test(x)), 'POI ex3: no false "within 4 s / 18.4 s or never" claim for three windows', t3.join(' | '));
    ok(/λ\(1,2\)·4 s = 2\.21 %/.test(t3[0]) && !/P\(ever\)/.test(t3[1]), 'POI ex3: pair bound 2.21 % shown, a vacuous (≥ 100 %) bound is left out', t3.join(' | '));
  }

  // --------------------------------------------------- comms J/S
  const PL = F('b1PathLoss'), PD = F('b1PathDist'), Dc = F('b1Dc');
  {
    const c = byId('js_comm'); const st = A.calcInit(c);
    st.cfg.model = 'fs';
    A.calcEdit(c, st, 'f', 300e6);
    // default jammer distance 20 km (inside the radio horizon): FSPL = 32.448 + 20·log 20 + 20·log 300 dB
    nearAbs(st.vals.ls, 101.9902, 1e-4, 'J/S C1: signal path loss');
    nearAbs(st.vals.lj, 108.0108, 1e-4, 'J/S C1: jammer path loss at 20 km');
    nearAbs(st.vals.js, 3.9794, 1e-4, 'J/S C1: free space');
    // C2: 50 MHz, two-ray
    const st2 = A.calcInit(c);
    st2.cfg.model = 'auto';
    A.calcSetMany(c, st2, { f: 50e6, hs: 2, hr: 2, hj: 30, ds: 10e3, dj: 30e3, erps: 37, erpj: 60 });
    nearAbs(st2.vals.ls, 147.9588, 1e-4, 'J/S C2: signal two-ray loss');
    nearAbs(st2.vals.lj, 143.5218, 1e-4, 'J/S C2: jammer two-ray loss');
    nearAbs(st2.vals.js, 27.4370, 1e-4, 'J/S C2: J/S');
    near(Dc(50e6, 2, 2), 8.383, 1e-3, 'J/S C2: signal-path crossover 8.383 m');
    near(Dc(50e6, 30, 2), 125.751, 1e-4, 'J/S C2: jammer-path crossover 125.75 m');
    // C3 and model continuity
    near(Dc(400e6, 10, 10), 1676.68, 1e-4, 'two-ray crossover 1.67668 km at 400 MHz, 10 m / 10 m');
    nearAbs(PL('tr', 400e6, 5000, 10, 10), 107.9588, 1e-4, 'two-ray loss at 5 km');
    const dc = Dc(400e6, 10, 10);
    nearAbs(PL('auto', 400e6, dc * (1 - 1e-12), 10, 10), PL('auto', 400e6, dc * (1 + 1e-12), 10, 10), 1e-7, 'auto model is continuous at the crossover');
    nearAbs(PL('blend', 400e6, dc, 10, 10), PL('fs', 400e6, dc, 10, 10) + 10 * Math.log10(2), 1e-7, 'blend is +3.01 dB at the crossover');
    nearAbs(PL('blend', 400e6, 1e3 * dc, 10, 10), PL('tr', 400e6, 1e3 * dc, 10, 10), 1e-3, 'blend approaches two-ray far out');
    for (const model of ['fs', 'tr', 'auto', 'blend']) {
      for (const d of [300, 5000, 50000]) near(PD(model, 400e6, PL(model, 400e6, d, 10, 10), 10, 10), d, 1e-9, model + ': distance inverse at ' + d + ' m');
    }
    // max jammer distance for J/S = 0 dB
    A.calcEdit(c, st, 'js', 0);
    ok(st.status.dj === 'calc', 'J/S: entering J/S solves the jammer distance', JSON.stringify(st.status));
    near(st.vals.dj, 20e3 * Math.pow(10, 3.9794 / 20), 1e-4, 'J/S: free-space jammer distance for 0 dB');
    // F1: flat-earth models beyond the radio horizon are flagged; the default example is within line of sight
    const vOf = x => Object.assign({ $: x.cfg }, x.vals);
    const sd = A.calcInit(c);
    ok(c.warn(vOf(sd)) === null && sd.vals.dj <= F('b1Horizon')(sd.vals.hj, sd.vals.hr), 'J/S: default jammer path (20 km) is inside the 28.4 km radio horizon', sd.vals.dj);
    A.calcEdit(c, sd, 'dj', 50e3);
    ok(/jammer path .* beyond its radio horizon \(28\.4\d* km\)/.test(c.warn(vOf(sd)) || ''), 'J/S: 50 km jammer path beyond the 28.4 km horizon is flagged', c.warn(vOf(sd)));
    ok(c.outputs.some(o => o.label.startsWith('Radio horizon')), 'J/S: radio horizon shown');
    // F2: blend distance inverse without cancellation (both antennas high, microwave)
    for (const [f, d, h] of [[100e9, 10e3, 10e3], [30e9, 10e3, 10e3], [10e9, 20e3, 10e3], [40e9, 1e3, 10e3], [300e6, 50e3, 30]])
      near(PD('blend', f, PL('blend', f, d, h, h), h, h), d, 1e-12, 'blend: distance inverse at ' + f / 1e9 + ' GHz, ' + d / 1e3 + ' km, antennas ' + h + ' m');
    const sa = A.calcInit(c);
    A.calcSetMany(c, sa, { f: 30e9, hj: 10e3, hr: 10e3, dj: 10e3 });
    A.calcEdit(c, sa, 'dj', NaN);
    ok(sa.status.dj === 'calc', 'J/S: clearing the jammer distance solves it at 30 GHz, 10 km antennas (was no valid solution)', JSON.stringify(sa.status));
    near(sa.vals.dj, 10e3, 1e-9, 'J/S: solved jammer distance 10 km');
    // F3: the note describes the smooth model's bound correctly
    ok(/at most 3 dB/.test(c.note) && !/either asymptote/.test(c.note), 'J/S: note says the blend is at most 3 dB above the applicable asymptote');
  }
  // S10: the jamming powers are isotropic-referenced (EIRP)
  for (const id of ['js_comm', 'js_spj', 'js_soj']) {
    const c = byId(id), lab = c.vars.filter(d => /^erp/.test(d.id)).map(d => d.label);
    ok(lab.length === 2 && lab.every(l => /EIRP/.test(l)) && /isotropic/.test(c.note) && /2\.15 dB/.test(c.note), id + ': power inputs labelled EIRP, note gives the isotropic reference', lab.join(' | '));
  }

  // --------------------------------------------------- radar J/S
  {
    const c = byId('js_spj'); const st = A.calcInit(c);
    A.calcSetMany(c, st, { bj: 1e6, br: 1e6 });
    nearAbs(st.vals.js, 40.9921, 1e-4, 'SPJ D1: J/S');
    near(st.vals.rbt, 282.095, 1e-5, 'SPJ D1: burn-through range');
    A.calcSetMany(c, st, { bj: 100e6 });
    nearAbs(st.vals.js, 20.9921, 1e-4, 'SPJ D1b: J/S with B_J/B_R = 100');
    near(st.vals.rbt, 2820.948, 1e-5, 'SPJ D1b: burn-through');
    A.calcSetMany(c, st, { erpj: 60, erpr: 115, r: 20e3, sigma: 5, bj: 10e6, br: 1e6, jsreq: 6 });
    nearAbs(st.vals.js, 25.0230, 1e-4, 'SPJ D2: J/S');
    near(st.vals.rbt, 2238.103, 1e-5, 'SPJ D2: burn-through');
  }
  {
    const c = byId('js_soj'); const st = A.calcInit(c);
    nearAbs(st.vals.js, 1.9612, 1e-4, 'SOJ D3: J/S');
    near(st.vals.rbt, 44662, 1e-4, 'SOJ D3: burn-through');
    A.calcSetMany(c, st, { grj: 35 });
    nearAbs(st.vals.js, 36.9612, 1e-4, 'SOJ D4: main-lobe J/S');
    near(st.vals.rbt, 5955.8, 1e-4, 'SOJ D4: burn-through');
  }

  // --------------------------------------------------- desense
  {
    const inrFor = F('b1InrFor'), des = F('b1Desense');
    abs(inrFor(3), -0.02062, 1e-5, 'max INR for 3 dB desense');
    abs(inrFor(1), -5.86825, 1e-5, 'max INR for 1 dB desense');
    abs(inrFor(0.5), -9.13574, 1e-5, 'max INR for 0.5 dB desense');
    abs(inrFor(0.1), -16.32775, 1e-5, 'max INR for 0.1 dB desense');
    abs(des(0), 3.01030, 1e-5, 'E3: INR 0 dB gives 3.01 dB');
    const c = byId('sinr'); const st = A.calcInit(c);
    abs(st.vals.des, 2.12443, 1e-5, 'E2: desense');
    abs(st.vals.sinr, 12.87557, 1e-5, 'E2: SINR');
    A.calcEdit(c, st, 'sinr', 14);
    ok(st.status.i === 'calc', 'SINR: required SINR solves the interference', JSON.stringify(st.status));
    abs(st.vals.i, -115 + inrFor(1), 1e-9, 'SINR: 1 dB of SINR loss allowed');
  }
  {
    const c = byId('recmix'); const st = A.calcInit(c);
    const n = -173.97519 + 10 * Math.log10(200e3) + 6;
    A.calcEdit(c, st, 'n', n);
    abs(st.vals.itot, -95.2288, 1e-4, 'E1: interference at the IF');
    abs(st.vals.c, -65.2288, 1e-4, 'E1: coupling');
    abs(st.vals.inr, 19.7361, 1e-3, 'E1: INR');
    abs(st.vals.des, 19.7820, 1e-3, 'E1: desense');
    abs(n + inrFor3() - st.vals.c, -49.7567, 1e-3, 'E1: max interferer for 3 dB');
    A.calcEdit(c, st, 'des', 1);
    ok(st.status.pi === 'calc', 'recmix: entering a desense solves the interferer level', JSON.stringify(st.status));
    abs(st.vals.pi, -55.6044, 1e-3, 'E1: max interferer for 1 dB');
    function inrFor3() { return F('b1InrFor')(3); }
  }

  // ------------------------------------------- spread spectrum, follower
  {
    const c = byId('ajmargin'); const st = A.calcInit(c);
    abs(st.vals.gp, 30, 1e-9, 'Gp 10 Mcps / 10 kbps');
    abs(st.vals.mj, 18, 1e-9, 'jamming margin 18 dB');
    A.calcSetMany(c, st, { bss: 2320, rb: 1, snrreq: 12 });
    abs(st.vals.gp, 33.6549, 1e-4, 'FH 2320 channels Gp');
    abs(st.vals.mj, 19.6549, 1e-4, 'FH jamming margin');
    A.calcSetMany(c, st, { bss: 1.023e6, rb: 50 });
    abs(st.vals.gp, 43.1091, 1e-4, 'GPS C/A processing gain');
  }
  {
    const c = byId('follower');
    const run = (hr, eta, tp) => { const st = A.calcInit(c); A.calcSetMany(c, st, { hr: hr, eta: eta, tproc: tp }); return st; };
    near(run(100, 0.5, 1e-3).vals.xmax, 1199.170e3, 1e-6, 'follower: 100 hops/s, 0.5, 1 ms');
    near(run(100, 1 / 3, 1e-3).vals.xmax, 699.516e3, 1e-6, 'follower: 100 hops/s, 1/3, 1 ms');
    near(run(1000, 0.5, 0.2e-3).vals.xmax, 89.938e3, 1e-5, 'follower: 1000 hops/s, 0.5, 0.2 ms');
    near(run(1000, 0.25, 0.1e-3).vals.xmax, 44.969e3, 1e-5, 'follower: 1000 hops/s, 0.25, 0.1 ms');
    ok(run(1000, 0.5, 0.6e-3).vals.xmax < 0, 'follower: too slow gives a negative max extra path');
    const st = A.calcInit(c);
    near(st.vals.dt, 333.4256e-6, 1e-6, 'follower: geometry delay 333.43 µs');
    near(st.vals.dt / st.vals.tdw, 0.33343, 1e-4, 'follower: delay fraction of a 1 ms hop');
    const vOf = x => Object.assign({ $: x.cfg }, x.vals);
    const jammed = c.outputs.find(o => o.label.startsWith('Part of each hop')), frac = c.outputs.find(o => o.label.startsWith('Delay as a fraction'));
    ok(c.warn(vOf(st)) === null, 'follower: default geometry is a valid triangle (no warning)');
    // impossible geometry: d_TJ + d_JR < d_TR (Torrieri ellipse needs extra path ≥ 0)
    const sb = A.calcInit(c);
    A.calcSetMany(c, sb, { dtj: 5e3, djr: 5e3, dtr: 30e3, tproc: 1e-6 });
    ok(/cannot form a triangle/.test(c.warn(vOf(sb)) || ''), 'follower: d_TJ + d_JR < d_TR is flagged', c.warn(vOf(sb)));
    const neg = { $: {}, dt: -65.7e-6, tdw: 1e-3 };
    ok(jammed.fn(neg) === 100 && isNaN(frac.fn(neg)), 'follower: jammed part capped at 100 %, negative delay fraction not shown (was 106.6 % / -6.57 %)', jammed.fn(neg));
    A.calcSetMany(c, sb, { dtj: 100e3, djr: 5e3, dtr: 10e3 });
    ok(/cannot form a triangle/.test(c.warn(vOf(sb)) || ''), 'follower: d_TJ > d_JR + d_TR is flagged too');
    const sd = A.calcInit(c);
    A.calcEdit(c, sd, 'dt', 50e-6);
    ok(/cannot form a triangle|shorter than the jammer reaction time/.test(c.warn(vOf(sd)) || ''), 'follower: a delay shorter than the reaction time is flagged', c.warn(vOf(sd)));
    ok(/shorter than the jammer reaction time/.test(c.warn({ $: {}, dt: 50e-6, tproc: 0.2e-3 }) || ''), 'follower: delay below the reaction time without distances is flagged');
    // S5: an ideal jammer with zero reaction time is a valid input
    ok(c.vars.find(d => d.id === 'tproc').inMin === 0 && c.vars.find(d => d.id === 'dt').inMin === 0, 'follower: reaction time and delay accept 0');
    const sz = A.calcInit(c);
    A.calcEdit(c, sz, 'tproc', 0);
    near(sz.vals.xmax, 0.5 * (1e-3) * 299792458, 1e-12, 'follower: zero reaction time gives max extra path c·η·T_dwell');
    // S5 regression: a jammer at the receiver (d_JR = 0) or at the transmitter (d_TJ = 0) is a valid geometry
    ok(['dtj', 'djr', 'dtr'].every(id => c.vars.find(d => d.id === id).inMin === 0 && c.vars.find(d => d.id === id).min > 0), 'follower: distances accept 0 as input, solving range stays > 0');
    const s0 = A.calcInit(c);
    A.calcSetMany(c, s0, { dtj: 20e3, dtr: 20e3 }); A.calcEdit(c, s0, 'djr', 0);
    ok(s0.vals.xp === 0 && c.warn(vOf(s0)) === null, 'follower: repeater at the receiver (d_JR = 0, d_TJ = d_TR) gives extra path 0, no warning', s0.vals.xp + ' ' + c.warn(vOf(s0)));
  }

  // --------------------------------------------------- LPI
  {
    const c = byId('lpi'); const st = A.calcInit(c);
    near(st.vals.rr, 58042.4, 1e-5, 'LPI G1: radar range');
    near(st.vals.ri, 2385670, 1e-5, 'LPI G1: intercept range');
    near(st.vals.alpha, 41.1022, 1e-5, 'LPI G1: alpha');
    A.calcSetMany(c, st, { pt: 1, gt: 30, gr: 30, gti: 30, sr: -127 });
    near(st.vals.rr, 10321.6, 1e-5, 'LPI G2: FMCW radar range');
    near(st.vals.ri, 4242.4, 1e-4, 'LPI G2: intercept range');
    near(st.vals.alpha, 0.41102, 1e-4, 'LPI G2: alpha');
    A.calcSetMany(c, st, { gi: 10, si: -90 });
    near(st.vals.ri, 238567, 1e-5, 'LPI G3: sensitive ESM intercept range');
    near(st.vals.alpha, 23.1135, 1e-5, 'LPI G3: alpha');
    // solving the radar power for a target alpha uses the coupled block
    A.calcEdit(c, st, 'alpha', 1);
    ok(['pt', 'f', 'sigma', 'sr', 'si', 'gi', 'gt', 'gr', 'gti'].some(id => st.status[id] === 'calc'), 'LPI: alpha target solves an input');
    // S5: an antenna at ground level (0 m) is a valid horizon input
    ok(c.vars.find(d => d.id === 'hrad').inMin === 0 && c.vars.find(d => d.id === 'hint').inMin === 0, 'LPI: horizon heights accept 0 m');
    near(F('b1Horizon')(0, 10), Math.sqrt(2 * 4 / 3 * 6371e3 * 10), 1e-12, 'LPI: horizon with one antenna at 0 m');
    near(st.vals.ri / st.vals.rr, 1, 1e-6, 'LPI: solved state is consistent');
  }
};
