// i18n rows Q — v1.63: auto-transcribe the clips that arrive from the team   [thai, english, lao]
I18N_ROWS.push(
  ['ถอดเสียงคลิปที่นำเข้าอัตโนมัติ', 'Auto-transcribe imported clips', 'ຖອດສຽງຄລິບທີ່ນຳເຂົ້າອັດຕະໂນມັດ'],
  ['(ข้ามคลิปที่เคยถอดแล้ว)', '(clips already transcribed are skipped)', '(ຂ້າມຄລິບທີ່ເຄີຍຖອດແລ້ວ)'],
  ['กำลังถอดเสียงคลิปที่นำเข้าอัตโนมัติ…', 'Auto-transcribing the imported clips…', 'ກຳລັງຖອດສຽງຄລິບທີ່ນຳເຂົ້າອັດຕະໂນມັດ…'],
  ['(คลิปที่เคยถอดแล้วจะข้าม ไม่เสียเงินซ้ำ)', '(clips already transcribed are skipped — no double charge)', '(ຄລິບທີ່ເຄີຍຖອດແລ້ວຈະຂ້າມ ບໍ່ເສຍເງິນຊ້ຳ)'],
  ['ถอดเสียงอัตโนมัติ: ยังไม่ได้ใส่ Gemini API key (กด ⚙ ตั้งค่า) — ข้ามไปก่อน', 'Auto-transcribe: no Gemini API key yet (press ⚙ Settings) — skipped for now', 'ຖອດສຽງອັດຕະໂນມັດ: ຍັງບໍ່ໄດ້ໃສ່ Gemini API key (ກົດ ⚙ ຕັ້ງຄ່າ) — ຂ້າມໄປກ່ອນ'],
  ['ถอดเสียงอัตโนมัติหยุดแล้ว:', 'Auto-transcribe stopped:', 'ຖອດສຽງອັດຕະໂນມັດຢຸດແລ້ວ:'],
  ['— กดถอดเสียงเองได้ที่แท็บ AI', '— you can transcribe by hand in the AI tab', '— ກົດຖອດສຽງເອງໄດ້ທີ່ແທັບ AI'],
  ['ถอดเสียงอัตโนมัติ: ถอดใหม่', 'Auto-transcribe: new', 'ຖອດສຽງອັດຕະໂນມັດ: ຖອດໃໝ່'],
  ['· ใช้ข้อความเดิม', '· reused saved text', '· ໃຊ້ຂໍ້ຄວາມເດີມ'],
  ['(ไม่เสียเงิน)', '(free)', '(ບໍ່ເສຍເງິນ)'],
  ['ขนาดการ์ดโปรเจกต์ (เล็ก ↔ ใหญ่)', 'Project card size (small ↔ large)', 'ຂະໜາດບັດໂປຣເຈັກ (ນ້ອຍ ↔ ໃຫຍ່)'],
  ['เซิร์ฟเวอร์มีเวอร์ชันใหม่กว่าของโปรเจกต์นี้', 'The server has a newer version of this project', 'ເຊີເວີມີເວີຊັນໃໝ່ກວ່າຂອງໂປຣເຈັກນີ້'],
  ['โหลดเวอร์ชันใหม่', 'Load the newer version', 'ໂຫຼດເວີຊັນໃໝ່'],
  ['ใช้ของเครื่องนี้ต่อ', "Keep this computer's version", 'ໃຊ້ອັນໃນເຄື່ອງນີ້ຕໍ່'],
  ['โหลดเวอร์ชันใหม่จากเซิร์ฟเวอร์แล้ว', 'Loaded the newer version from the server', 'ໂຫຼດເວີຊັນໃໝ່ຈາກເຊີເວີແລ້ວ'],
);

// v1.67 multi-take
I18N_ROWS.push(
  ['เลือกเทคที่ดีที่สุดจากเทคซ้ำ (ข้ามคลิป เริ่มที่ต้นประโยคเสมอ)', 'Pick the best take from retakes (across clips, always start at a sentence start)', 'ເລືອກເທກທີ່ດີທີ່ສຸດຈາກເທກຊ້ຳ (ຂ້າມຄລິບ ເລີ່ມທີ່ຕົ້ນປະໂຫຍກສະເໝີ)'],
  ['กำลังเทียบเทคซ้ำข้ามคลิป…', 'Comparing retakes across clips…', 'ກຳລັງປຽບທຽບເທກຊ້ຳຂ້າມຄລິບ…'],
  ['เทคนี้คะแนน', 'Take score', 'ເທກນີ້ຄະແນນ'],
  ['มีเทคซ้ำ', 'has retakes', 'ມີເທກຊ້ຳ'],
  ['เทคที่ไม่ได้ใช้', 'Takes not used', 'ເທກທີ່ບໍ່ໄດ້ໃຊ້'],
  ['เริ่มด้วยคำเอ่อ/อืม', 'Starts with a filler (uh/um)', 'ເລີ່ມດ້ວຍຄຳ ເອີ/ອືມ'],
  ['ต้นประโยคอาจติดเสียงก่อนหน้า', 'The start may carry sound from the previous sentence', 'ຕົ້ນປະໂຫຍກອາດຕິດສຽງກ່ອນໜ້າ'],
  ['จบแบบถูกตัด (กดหยุดอัด)', 'Ends abruptly (recording stopped)', 'ຈົບແບບຖືກຕັດ (ກົດຢຸດອັດ)'],
  ['ปรับให้เริ่มที่ต้นประโยค', 'Adjusted to start at a sentence start', 'ປັບໃຫ້ເລີ່ມທີ່ຕົ້ນປະໂຫຍກ'],
  ['ปรับให้จบที่ท้ายประโยค', 'Adjusted to end at a sentence end', 'ປັບໃຫ້ຈົບທີ່ທ້າຍປະໂຫຍກ'],
  ['เทคซ้ำกับฉากก่อนหน้า', 'Same line as an earlier scene', 'ເທກຊ້ຳກັບສາກກ່ອນໜ້າ'],
  ['ฉากเปิดไม่มีเสียงพูด — ตรวจว่าเปิดเรื่องพอไหม', 'The opening scene has no speech — check that it works as a hook', 'ສາກເປີດບໍ່ມີສຽງເວົ້າ — ກວດວ່າເປີດເລື່ອງພໍບໍ'],
);
