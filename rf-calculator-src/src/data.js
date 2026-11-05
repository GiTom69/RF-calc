// ============================================================================
// data.js - built-in offline reference data. Typical values; always confirm
// critical numbers against the manufacturer's datasheet.
// ============================================================================

// Coax attenuation model: dB/100 ft = k1*sqrt(f_MHz) + k2*f_MHz (fitted to typical datasheet points).
// fmax is the rated maximum frequency (MIL-DTL-17 rating for the RG types: RG-174 and RG-58 are 1 GHz).
const CABLES = [
  { name: 'RG-174',          z0: 50, vf: 0.66, k1: 0.877,  k2: 0.00126,  fmax: 1,  od: 2.8 },
  { name: 'RG-316',          z0: 50, vf: 0.695, k1: 0.78,  k2: 0.0005,   fmax: 3,  od: 2.5 },
  { name: 'RG-58 C/U',       z0: 50, vf: 0.66, k1: 0.4562, k2: 0.00338,  fmax: 1,  od: 4.95 },
  { name: 'RG-142',          z0: 50, vf: 0.695, k1: 0.43,  k2: 0.0009,   fmax: 12.4, od: 4.95 },
  { name: 'RG-8X (mini-8)',  z0: 50, vf: 0.78, k1: 0.36,   k2: 0.0016,   fmax: 1,  od: 6.1 },
  { name: 'RG-213',          z0: 50, vf: 0.66, k1: 0.2047, k2: 0.001525, fmax: 1,  od: 10.3 },
  { name: 'LMR-100A',        z0: 50, vf: 0.66, k1: 0.70,   k2: 0.0016,   fmax: 6,  od: 2.79 },
  { name: 'LMR-195',         z0: 50, vf: 0.80, k1: 0.3547, k2: 0.00051,  fmax: 6,  od: 4.95 },
  { name: 'LMR-240',         z0: 50, vf: 0.84, k1: 0.2375, k2: 0.000527, fmax: 6,  od: 6.1 },
  { name: 'LMR-400',         z0: 50, vf: 0.85, k1: 0.1226, k2: 0.000248, fmax: 6,  od: 10.29 },
  { name: 'LMR-600',         z0: 50, vf: 0.87, k1: 0.0731, k2: 0.000341, fmax: 6,  od: 14.99 },
  { name: 'Semi-rigid .141 (RG-402)', z0: 50, vf: 0.70, k1: 0.3330, k2: 0.000469, fmax: 18, od: 3.58 },
  { name: 'Semi-rigid .085 (RG-405)', z0: 50, vf: 0.70, k1: 0.6105, k2: 0.000695, fmax: 20, od: 2.20 },
  { name: 'RG-6 (75 Ω)',     z0: 75, vf: 0.85, k1: 0.19,   k2: 0.0005,   fmax: 3,  od: 6.9 },
];
const cableAtt = (c, f) => (c.k1 * sqrt(f / 1e6) + c.k2 * f / 1e6) / 30.48; // dB/m

// PCB / substrate materials: design Dk (not the clamped-stripline process Dk) and loss
// tangent, at ~10 GHz unless the name gives another frequency
const SUBSTRATES = [
  { name: 'FR-4 (typical)',        er: 4.4,  tand: 0.020 },
  { name: 'FR-4 (high Tg, ~2 GHz)', er: 4.2, tand: 0.018 },
  { name: 'Isola 370HR (~2 GHz)',  er: 4.04, tand: 0.021 },
  { name: 'Rogers RO4003C',        er: 3.55, tand: 0.0027 },
  { name: 'Rogers RO4350B',        er: 3.66, tand: 0.0037 },
  { name: 'Rogers RO4360G2',       er: 6.4,  tand: 0.0038 },
  { name: 'Rogers RO3003',         er: 3.00, tand: 0.0010 },
  { name: 'Rogers RO3006',         er: 6.50, tand: 0.0020 },
  { name: 'Rogers RO3010',         er: 11.2, tand: 0.0022 },
  { name: 'Rogers RT/duroid 5880', er: 2.20, tand: 0.0009 },
  { name: 'Rogers RT/duroid 5870', er: 2.33, tand: 0.0012 },
  { name: 'Rogers RT/duroid 6010', er: 10.7, tand: 0.0023 },
  { name: 'Taconic TLY-5',         er: 2.20, tand: 0.0009 },
  { name: 'PTFE (pure)',           er: 2.10, tand: 0.0002 },
  { name: 'Polyimide (Kapton)',    er: 3.5,  tand: 0.0026 },
  { name: 'LTCC (Ferro A6M)',      er: 5.9,  tand: 0.0020 },
  { name: 'Fused quartz',          er: 3.78, tand: 0.0001 },
  { name: 'Alumina 99.6 %',        er: 9.9,  tand: 0.0001 },
  { name: 'Aluminium nitride',     er: 8.8,  tand: 0.0005 },
  { name: 'GaAs',                  er: 12.9, tand: 0.0006 },
  { name: 'Silicon (high resistivity)', er: 11.7, tand: 0.001 },
  { name: 'Air',                   er: 1.0006, tand: 0 },
];

// Coax dielectrics
const DIELECTRICS = [
  { name: 'Air',                 er: 1.0006 },
  { name: 'PTFE (solid)',        er: 2.10 },
  { name: 'Polyethylene (solid)', er: 2.25 },
  { name: 'Foam PE (VF ≈ 0.82)',  er: 1.49 },
  { name: 'Foam PE (VF ≈ 0.85)',  er: 1.38 },
  { name: 'FEP',                 er: 2.10 },
  { name: 'Polystyrene',         er: 2.55 },
  { name: 'Nylon',               er: 3.5 },
];

// Conductors: bulk resistivity at 20 °C (Ω·m, CRC Handbook) and relative permeability.
// New entries go at the end: the skin-depth preset stores the index.
const CONDUCTORS = [
  { name: 'Silver',                 rho: 1.59e-8, mur: 1 },
  { name: 'Copper (pure)',          rho: 1.68e-8, mur: 1 },
  { name: 'Copper (annealed, IACS)', rho: 1.724e-8, mur: 1 },
  { name: 'Gold',                   rho: 2.21e-8, mur: 1 },
  { name: 'Aluminium',              rho: 2.65e-8, mur: 1 },
  { name: 'Tungsten',               rho: 5.28e-8, mur: 1 },
  { name: 'Beryllium copper',       rho: 7.0e-8,  mur: 1 },
  { name: 'Brass',                  rho: 7.0e-8,  mur: 1 },
  { name: 'Nickel (μr ≈ 100 below ~100 MHz only)', rho: 6.99e-8, mur: 100 },
  { name: 'Tin',                    rho: 1.24e-7, mur: 1 },
  { name: 'Solder Sn63Pb37',        rho: 1.45e-7, mur: 1 },
  { name: 'Stainless steel 304',    rho: 7.2e-7,  mur: 1 },
  { name: 'Gold (electroplated, typ.)', rho: 2.44e-8, mur: 1 },
];

const IEEE_BANDS = [
  ['HF', 3e6, 30e6], ['VHF', 30e6, 300e6], ['UHF', 300e6, 1e9], ['L', 1e9, 2e9], ['S', 2e9, 4e9],
  ['C', 4e9, 8e9], ['X', 8e9, 12e9], ['Ku', 12e9, 18e9], ['K', 18e9, 27e9], ['Ka', 27e9, 40e9],
  ['V', 40e9, 75e9], ['W', 75e9, 110e9], ['mm (G)', 110e9, 300e9],
];

const ITU_BANDS = [
  ['ELF', 3, 30, '100,000–10,000 km'], ['SLF', 30, 300, '10,000–1,000 km'], ['ULF', 300, 3e3, '1,000–100 km'],
  ['VLF', 3e3, 30e3, '100–10 km'], ['LF', 30e3, 300e3, '10–1 km'], ['MF', 300e3, 3e6, '1 km–100 m'],
  ['HF', 3e6, 30e6, '100–10 m'], ['VHF', 30e6, 300e6, '10–1 m'], ['UHF', 300e6, 3e9, '1 m–10 cm'],
  ['SHF', 3e9, 30e9, '10–1 cm'], ['EHF', 30e9, 300e9, '10–1 mm'], ['THF', 300e9, 3e12, '1–0.1 mm'],
];

// Common allocations [name, f_low, f_high (equal for a single carrier), note]
const COMMON_BANDS = [
  ['ISM 6.78 MHz', 6.765e6, 6.795e6, 'ISM'],
  ['ISM 13.56 MHz (NFC/RFID)', 13.553e6, 13.567e6, 'ISM'],
  ['ISM 27.12 MHz', 26.957e6, 27.283e6, 'ISM'],
  ['ISM 40.68 MHz', 40.66e6, 40.70e6, 'ISM'],
  ['FM broadcast', 87.5e6, 108e6, ''],
  ['Aviation VHF (AM voice)', 118e6, 137e6, ''],
  ['Marine VHF', 156e6, 162.025e6, ''],
  ['ISM / SRD 433 MHz (ITU R1)', 433.05e6, 434.79e6, 'ISM'],
  ['SRD 868 MHz (EU, LoRa/Sigfox)', 863e6, 870e6, ''],
  ['ISM 915 MHz (ITU R2)', 902e6, 928e6, 'ISM'],
  ['ADS-B / Mode S', 1090e6, 1090e6, ''],
  ['GPS L5 / Galileo E5a', 1176.45e6, 1176.45e6, 'GNSS'],
  ['GPS L2', 1227.60e6, 1227.60e6, 'GNSS'],
  ['BeiDou B1I', 1561.098e6, 1561.098e6, 'GNSS'],
  ['GPS L1 / Galileo E1', 1575.42e6, 1575.42e6, 'GNSS'],
  ['GLONASS G1', 1598.0625e6, 1605.375e6, 'GNSS'],
  ['Inmarsat L-band (down)', 1525e6, 1559e6, 'SatCom'],
  ['Iridium', 1616e6, 1626.5e6, 'SatCom'],
  ['LTE B20 DL', 791e6, 821e6, 'Cellular'],
  ['LTE B3 DL', 1805e6, 1880e6, 'Cellular'],
  ['LTE B1 DL', 2110e6, 2170e6, 'Cellular'],
  ['LTE B7 DL', 2620e6, 2690e6, 'Cellular'],
  ['5G NR n78', 3300e6, 3800e6, 'Cellular'],
  ['5G NR n77', 3300e6, 4200e6, 'Cellular'],
  ['ISM 2.45 GHz (ITU RR 5.150)', 2400e6, 2500e6, 'ISM'],
  ['2.4 GHz SRD (Wi-Fi, BT, Zigbee)', 2400e6, 2483.5e6, ''],
  ['Bluetooth channels', 2402e6, 2480e6, ''],
  ['Wi-Fi 5 GHz (U-NII 1–4)', 5150e6, 5895e6, ''],
  ['ISM 5.8 GHz', 5725e6, 5875e6, 'ISM'],
  ['Wi-Fi 6E / 7 (6 GHz)', 5925e6, 7125e6, ''],
  ['UWB', 3.1e9, 10.6e9, ''],
  ['ISM 24 GHz', 24.0e9, 24.25e9, 'ISM'],
  ['5G NR n258', 24.25e9, 27.5e9, 'Cellular'],
  ['5G NR n260', 37e9, 40e9, 'Cellular'],
  ['ISM 61 GHz', 61.0e9, 61.5e9, 'ISM'],
  ['Automotive radar', 76e9, 81e9, ''],
];

// Rectangular waveguides [name, a mm, b mm, recommended f_low, f_high]
const WAVEGUIDES = [
  ['WR-650', 165.10, 82.55, 1.12e9, 1.70e9], ['WR-430', 109.22, 54.61, 1.70e9, 2.60e9],
  ['WR-284', 72.14, 34.04, 2.60e9, 3.95e9], ['WR-187', 47.55, 22.15, 3.95e9, 5.85e9],
  ['WR-137', 34.85, 15.80, 5.85e9, 8.20e9], ['WR-112', 28.50, 12.62, 7.05e9, 10.0e9],
  ['WR-90', 22.86, 10.16, 8.20e9, 12.4e9], ['WR-75', 19.05, 9.53, 10.0e9, 15.0e9],
  ['WR-62', 15.80, 7.90, 12.4e9, 18.0e9], ['WR-51', 12.95, 6.48, 15.0e9, 22.0e9],
  ['WR-42', 10.67, 4.32, 18.0e9, 26.5e9], ['WR-34', 8.64, 4.32, 22.0e9, 33.0e9],
  ['WR-28', 7.11, 3.56, 26.5e9, 40.0e9], ['WR-22', 5.69, 2.84, 33.0e9, 50.0e9],
  ['WR-19', 4.78, 2.39, 40.0e9, 60.0e9], ['WR-15', 3.76, 1.88, 50.0e9, 75.0e9],
  ['WR-12', 3.10, 1.55, 60.0e9, 90.0e9], ['WR-10', 2.54, 1.27, 75.0e9, 110e9],
];

// RF connectors [name, impedance, typical max frequency (GHz), coupling]
const CONNECTORS = [
  ['F', '75 Ω', '1 (3 for some types)', 'Threaded'],
  ['BNC', '50 / 75 Ω', '4', 'Bayonet'],
  ['TNC', '50 Ω', '11 (18 precision)', 'Threaded'],
  ['N', '50 / 75 Ω', '11 (18 precision)', 'Threaded'],
  ['7/16 DIN', '50 Ω', '7.5', 'Threaded'],
  ['4.3-10', '50 Ω', '6', 'Screw / push-pull'],
  ['SMA', '50 Ω', '18 (26.5 for some types)', 'Threaded'],
  ['3.5 mm', '50 Ω', '26.5 (34)', 'Threaded, SMA-compatible'],
  ['2.92 mm (K)', '50 Ω', '40', 'Threaded, SMA-compatible'],
  ['2.4 mm', '50 Ω', '50', 'Threaded'],
  ['1.85 mm (V)', '50 Ω', '67', 'Threaded, 2.4 mm-compatible'],
  ['1.0 mm (W)', '50 Ω', '110', 'Threaded'],
  ['SMB', '50 / 75 Ω', '4', 'Snap-on'],
  ['SMC', '50 Ω', '10', 'Threaded'],
  ['SMP', '50 Ω', '40', 'Push-on'],
  ['MCX', '50 / 75 Ω', '6', 'Snap-on'],
  ['MMCX', '50 Ω', '6', 'Snap-on'],
  ['QMA', '50 Ω', '6 (18 for some types)', 'Quick-lock'],
  ['U.FL / IPEX MHF', '50 Ω', '6', 'Snap-on (limited mating cycles)'],
];

// Standard component value series (one decade)
const E_SERIES = {
  E6:  [10, 15, 22, 33, 47, 68],
  E12: [10, 12, 15, 18, 22, 27, 33, 39, 47, 56, 68, 82],
  E24: [10, 11, 12, 13, 15, 16, 18, 20, 22, 24, 27, 30, 33, 36, 39, 43, 47, 51, 56, 62, 68, 75, 82, 91],
  E48: [100, 105, 110, 115, 121, 127, 133, 140, 147, 154, 162, 169, 178, 187, 196, 205, 215, 226, 237, 249,
        261, 274, 287, 301, 316, 332, 348, 365, 383, 402, 422, 442, 464, 487, 511, 536, 562, 590, 619, 649,
        681, 715, 750, 787, 825, 866, 909, 953],
  E96: [100, 102, 105, 107, 110, 113, 115, 118, 121, 124, 127, 130, 133, 137, 140, 143, 147, 150, 154, 158,
        162, 165, 169, 174, 178, 182, 187, 191, 196, 200, 205, 210, 215, 221, 226, 232, 237, 243, 249, 255,
        261, 267, 274, 280, 287, 294, 301, 309, 316, 324, 332, 340, 348, 357, 365, 374, 383, 392, 402, 412,
        422, 432, 442, 453, 464, 475, 487, 499, 511, 523, 536, 549, 562, 576, 590, 604, 619, 634, 649, 665,
        681, 698, 715, 732, 750, 768, 787, 806, 825, 845, 866, 887, 909, 931, 953, 976],
};

// Nearest standard values below/above x and the closest one, in the given series.
function nearestE(x, series) {
  if (!(x > 0) || !isFinite(x)) return null;
  const base = E_SERIES[series];
  const digits = base[0] >= 100 ? 2 : 1;
  const dec = Math.floor(log10(x)) - digits;
  const cands = [];
  for (const d of [dec - 1, dec, dec + 1]) for (const b of base) cands.push(Number((b * Math.pow(10, d)).toPrecision(3)));
  cands.sort((a, b) => a - b);
  let lo = cands[0], hi = cands[cands.length - 1];
  for (const c of cands) { if (c <= x * (1 + 1e-12)) lo = c; }
  for (let i = cands.length - 1; i >= 0; i--) { if (cands[i] >= x * (1 - 1e-12)) hi = cands[i]; }
  const best = Math.abs(Math.log(lo / x)) <= Math.abs(Math.log(hi / x)) ? lo : hi;
  return { lo: lo, hi: hi, best: best, err: (best - x) / x * 100 };
}
