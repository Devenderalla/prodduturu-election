/* =========================================================
   demo-voters.js - FICTIONAL demonstration records.
   These names, serial numbers and wards are invented purely
   to demonstrate the volunteer search interface. They are
   NOT an electoral roll and contain no real voter data.
   The real roll is never loaded into this app in this phase.
   ========================================================= */
(function (global) {
  'use strict';
  var App = global.App = global.App || {};

  var RAW = [
    ['Anjali Devi', 'అంజలి దేవి', '235', 12, '3', true],
    ['Bhaskar Rao', 'భాస్కర్ రావు', '235', 27, '3', true],
    ['Chandrika Bai', 'చంద్రిక బాయి', '235', 41, '1', true],
    ['Dhanalakshmi K', 'ధనలక్ష్మి కె', '235', 58, '', false],
    ['Eswar Prasad', 'ఈశ్వర్ ప్రసాద్', '235', 73, '2', true],
    ['Gopal Krishna', 'గోపాల కృష్ణ', '235', 96, '2', true],
    ['Hema Sundari', 'హేమ సుందరి', '235', 114, '1', true],
    ['Indira Rani', 'ఇందిరా రాణి', '235', 139, '', false],
    ['Jagadish Babu', 'జగదీష్ బాబు', '235', 162, '4', true],
    ['Kavitha Sri', 'కవిత శ్రీ', '235', 188, '4', true],
    ['Lakshmi Narayana', 'లక్ష్మీ నారాయణ', '235', 215, '3', true],
    ['Madhavi Latha', 'మాధవి లత', '235', 243, '', false],
    ['Nagendra Kumar', 'నాగేంద్ర కుమార్', '235', 271, '1', true],
    ['Omkar Reddy', 'ఓంకార్ రెడ్డి', '235', 304, '2', true],
    ['Padmavathi N', 'పద్మావతి ఎన్', '235', 338, '2', true],
    ['Raghavendra S', 'రాఘవేంద్ర ఎస్', '235', 377, '4', true],
    ['Sarojini Amma', 'సరోజిని అమ్మ', '235', 412, '', false],
    ['Tirupathi Rao', 'తిరుపతి రావు', '235', 455, '3', true],
    ['Usha Kiran', 'ఉష కిరణ్', '235', 498, '1', true],
    ['Venkateswarlu B', 'వెంకటేశ్వర్లు బి', '235', 534, '4', true],
    ['Yamuna Devi', 'యమున దేవి', '235', 601, '2', true],
    ['Aruna Jyothi', 'అరుణ జ్యోతి', '235', 668, '', false],
    ['Satyanarayana M', 'సత్యనారాయణ ఎం', '235', 742, '3', true],
    ['Rajeswari T', 'రాజేశ్వరి టి', '235', 815, '1', true],
    ['Prabhakar Reddy', 'ప్రభాకర్ రెడ్డి', '235', 903, '4', true],
    ['Sulochana K', 'సులోచన కె', '235', 1004, '2', true],
    ['Appala Naidu', 'అప్పల నాయుడు', '236', 9, '5', true],
    ['Bhagyalakshmi R', 'భాగ్యలక్ష్మి ఆర్', '236', 33, '5', true],
    ['Chinna Rao', 'చిన్న రావు', '236', 61, '', false],
    ['Durga Prasad', 'దుర్గా ప్రసాద్', '236', 88, '6', true],
    ['Eswaramma V', 'ఈశ్వరమ్మ వి', '236', 117, '6', true],
    ['Govindamma S', 'గోవిందమ్మ ఎస్', '236', 151, '7', true],
    ['Harinath Babu', 'హరినాథ్ బాబు', '236', 183, '', false],
    ['Jyothirmayi P', 'జ్యోతిర్మయి పి', '236', 216, '5', true],
    ['Kameswari D', 'కామేశ్వరి డి', '236', 254, '7', true],
    ['Mallikarjuna Rao', 'మల్లికార్జున రావు', '236', 289, '6', true],
    ['Nageswaramma T', 'నాగేశ్వరమ్మ టి', '236', 322, '', false],
    ['Pardhasaradhi K', 'పార్థసారధి కె', '236', 365, '5', true],
    ['Ramanamma G', 'రామనమ్మ జి', '236', 401, '7', true],
    ['Srinivasa Rao V', 'శ్రీనివాస రావు వి', '236', 447, '6', true],
    ['Tulasi Devi', 'తులసి దేవి', '236', 492, '5', true],
    ['Varalakshmi J', 'వరలక్ష్మి జె', '236', 528, '', false],
    ['Yesu Babu', 'యేసు బాబు', '236', 574, '7', true],
    ['Annapurna M', 'అన్నపూర్ణ ఎం', '236', 639, '6', true],
    ['Koteswara Rao', 'కోటేశ్వర రావు', '236', 703, '5', true],
    ['Pushpavathi S', 'పుష్పావతి ఎస్', '236', 781, '7', true],
    ['Subba Rao N', 'సుబ్బా రావు ఎన్', '236', 864, '', false],
    ['Vijaya Kumari', 'విజయ కుమారి', '236', 941, '6', true]
  ];

  var RECORDS = RAW.map(function (r, i) {
    return {
      id: 'demo-' + (i + 1),
      name: r[0],
      nameTe: r[1],
      part: r[2],
      serial: r[3],
      ward: r[4],
      wardVerified: r[5],
      demo: true
    };
  });

  function normalise(s) {
    return String(s == null ? '' : s).toLowerCase().replace(/\s+/g, ' ').trim();
  }

  App.demoVoters = {
    count: RECORDS.length,
    all: function () { return RECORDS.slice(); },
    /**
     * Search by fictional name (English or Telugu) or serial number.
     * Returns at most `limit` records. Read-only; nothing is recorded.
     */
    search: function (query, opts) {
      opts = opts || {};
      var q = normalise(query);
      if (q.length < 2) return [];
      var digits = /^\d+$/.test(q);
      var out = RECORDS.filter(function (r) {
        if (opts.part && opts.part !== 'all' && r.part !== opts.part) return false;
        if (digits) return String(r.serial) === q || String(r.serial).indexOf(q) === 0;
        return normalise(r.name).indexOf(q) >= 0 || normalise(r.nameTe).indexOf(q) >= 0;
      });
      out.sort(function (a, b) {
        if (a.part !== b.part) return a.part < b.part ? -1 : 1;
        return a.serial - b.serial;
      });
      return out.slice(0, opts.limit || 25);
    }
  };
})(window);
