# v57 — 26 Eylül 2026 canlı yayın kaydı

Kullanıcı bu turda commit, push ve canlı yayına açıkça onay verdi.
Yayın adresi: https://defter.bilgearena.com/ ; kütüphane: /library/.

## Kaynak ve yayın

- GitHub dalı: `repair/v57-stability`. `master` birleştirmesi yapılmadı.
- v56 tam kaynak kaydı: `9da998b81cbd402c1f4ea45a0cf28dae2b5f4b10`.
- v57 uygulama onarımları: `3952386cc781256e140fd9c5895e9368cbcf15d0`.
- Canlı paket kaynağı: `11a9a725bad31f5495b244fba8b709bc02e181ad`.
- Sonraki `2cc5727` yalnız güvenlik yaması ve geri alma işletim aracıdır;
  web/API/kütüphane paketini değiştirmez. Sonraki belge commit'i de aynı şekilde.
- Paket SHA256SUMS hash'i:
  `e5db524782bea09f10ffcd917ec8be238c6dd5c9af826a8eabca0aeb3c7cd411`.
- Canlı yol: `/opt/bilge-defter-classroom-v57/ui`;
  `/opt/bilge-defter-invited/current` buraya işaret ediyor.
- Hesap imajı: `sha256:f69cead9ed2e146c88bc46462fdbce7ae264d6338cd40ca00786320486dc2fb8`.
  Önceki imajın Python 3.12.14 ve çalışma bağımlılıkları korunarak sadece uygulama
  kaynakları eklendi. Pytest yalnız ayrı doğrulama imajındadır.

## Neler doğrulandı?

- Üretim Python sürümünde **77 API testi**, ayrı sentetik hesap veritabanı ve
  imzalı test kimlikleriyle geçti. Ağ erişimi kapalı doğrulama konteyneri kullanıldı.
- Tam sözlük snapshot'ı test edildi: TDK **98.995**, EN–TR **47.537** kayıt;
  onaylı sentetik hesapla listeleme/arama ve salt-okunurluk kontrol edildi.
- Snapshot `/opt/bilge-defter-classroom-v57/dictionary/bilge_defter_dictionary.db`,
  hash `2bd9c1dc7b09dbfb6c05dbd78af66388ac6e35907f128261c56fe60e3e2a598d`;
  canlı hesap konteynerine yalnız okunur bağlandı. Merkezi hafıza anahtarı veya
  hafıza veritabanı uygulamaya verilmedi.
- Ön yayında ve canlı origin'de **237 HTTP dosyası**, **234 çevrimdışı varlık**,
  **14 kimliksiz/sahte kimlik reddi**, **6 kapalı yol** doğrulandı.
- Kütüphane konteynerinin gerçek sağlık durumu **healthy**. Yanlış PDF sağlık
  kontrolü yerine loopback kütüphane kontrolü kullanılıyor. Dışarıdan sağlık yolu 404.
- Kamusal ana sayfa ve kütüphane kimliksiz isteğe **Cloudflare Access 302** döndü.
  Bu, gerçek öğrenci oturumunun doğrulandığı anlamına gelmez.
- Yeni web/hesap/kütüphane konteynerleri dışında konteyner kimlikleri ve başlama
  zamanları korundu. Paylaşılan servis, aşağıdaki ayrı güvenlik yaması için sonradan
  bilinçli olarak yeniden başlatıldı; bunun ardından canlı v57 tekrar doğrulandı.
- Önceki turdaki 172 tarayıcı/PWA ve 43 kütüphane testi kaydı
  `REPAIR_20260926.md` içindedir; bu tur tekrar koşuldu diye sunulmaz.

## Veriler ve bağımsız yedek

Hesap ve yer imi SQLite veritabanları backup API ile tutarlı kopyalandı; mevcut
Windows kullanıcısı ve SYSTEM ile sınırlı klasöre indirildi:

`D:/Projelerim/_backups/bilge-defter-20260926-repair/v57-live-data`.

Hash, SQLite bütünlüğü, foreign-key kontrolü ve yeni dosyaya tam geri yükleme
karşılaştırması geçti. Satır içerikleri çıktıya yazılmadı. Yedekler Git'e eklenmedi.

- Hesap yedeği: `f7b7b43b78acf265f256b77b489dc4f4602e84d59866989a1eb4d29068bde13f`.
- Yer imi yedeği: `8cb625e154a5f137d07955b18ebd5a5bc708fa010fe2fe6debc0ddebfce3aa3d`.

Canlı hesap, sır, kaynak PDF ve yer imi mount yolları değişmedi; şema değişikliği
yok. Bu sunucu yedekleri, cihazlarda yerel duran notların bağımsız JSON yedeğinin
yerine geçmez. Yayımlanan testlerde öğrenci hesabı oluşturulmadı/değiştirilmedi.

## Ortak sunucu push güvenlik yaması

Canlı `/opt/linux-ai-server` HEAD `8bbee9cbb4e431738f00f627b384e38b117aa1e5`
GitHub geçmişiyle eşleşmiyordu; GitHub tarafında bu modül de yoktu. Geniş bir Git
pull, reset veya tarih birleştirmesi yapılmadı. İncelenmiş değişiklik
`work/security/push-containment.patch` içinde GitHub'a gönderildi; yerel kaynak
commit'i ayrıca `bilge-defter-server-repair` içinde `607c6be` olarak korunuyor.

Yalnız `/opt/linux-ai-server/app/api/bilge_defter.py` atomik değiştirildi:

- Önceki hash: `54dcda4a267d45e2a8e803ba0b6d0deaed1ecba697a59d5a0e40720bf6b09b93`.
- Yeni hash: `78813c823cb3a745671c635ed09754e8e0d910345977d2b06abe805bcbf8a245`.
- AST karşılaştırması sadece üç onaylı işlevin değiştiğini doğruladı. Gönderici
  eski aboneliklere/ağa erişmez; iki push ucu mevcut kimlik kontrolünden sonra 503.
- Beş yalıtılmış gerçek-kaynak davranış kontrolü, servis açılışı, canlı kimliksiz
  401 kontrolü ve v57 tekrar kontrolü geçti. Gerçek JWT ile push 503 canlı testi
  yapılmadı; bunu yalıtılmış test ve kaynak hash'i destekliyor.
- Eski abonelikler, şifreli yedekler ve diğer veritabanları değiştirilmedi.
- Ortak servis yeniden başlatıldı ve aktif. Sunucunun Git HEAD'i değiştirilmedi;
  bu dosya bilinçli yerel yama olarak duruyor. Mevcut kirli
  `infra/monitoring/prometheus.yml` korunmuştur. Tam sunucu Git uzlaştırması yapılmadı.

## Geri alma

Önceki üç konteyner `*-rollback-v57` adlarıyla durdurulmuş olarak saklanıyor.
Kod geri alınır; sonradan yazılmış kullanıcı verisinin üstüne eski yedek basılmaz.

```sh
sudo python3 /opt/bilge-defter-classroom-v57/deploy-v57-operations.py rollback
```

İşletim aracının hash'i:
`8fa8c908c7f7728034fe9d0f1f8ec31ce114298a0431d3e010bc4ce721e768cf`.
İlk yayının `deploy-v57.py` dosyası ve makbuzu değişmeden tutuldu. Sonraki
`deploy-v57-operations.py`, geri alma sırasında ilgisiz servislerin geçmişteki
PID'sini değil, geri alma başı/sonundaki durumunu karşılaştırır; böylece onaylı
güvenlik restart'ı gelecekteki geri almayı engellemez. Gerçek canlı geri alma
bu tur tetiklenmedi; kod, eski konteynerler ve yedekler hazırlandı.

Ortak push yaması ayrı geri alınır; bu güvenlik açığını tekrar açacağından yalnız
acil ve açıkça onaylı durumda kullanılmalıdır:

```sh
sudo python3 /opt/bilge-defter-classroom-v57/security/deploy-push-containment.py rollback
```

## Açık kabul maddeleri

- Dilara: avuç ekrandayken 10 dakika yazı, iki parmak kaydırma sonrası kaleme
  dönüş, kalemi/avuç temasını kaldırmadan devam, uygulamadan çıkıp dönüş,
  kayıt/yeniden açma ve bağımsız JSON yedeği.
- Gerçek hesapta e-posta dönüşü, sözlük araması ve kütüphane yer imi kabulü.
- Çok büyük defterlerde bütün defterin kayıt/serileştirme maliyeti hâlâ mevcut;
  tüm kasmaların giderildiği iddia edilmez. iPad kusuru cihaz kabulüne kadar açık.
- 50 eşzamanlı öğrenci yük testi ve akademik/OCR kalite kabulü yapılmadı.
- Özel Tailscale adresi bilinçli olarak **v46** kaldı; ayrı depolama/kimlik profilidir.
  Access, DNS, Bilge Arena ve yayınlanmamış PDF çalışma ağacı değiştirilmedi.

İlk ön testte Docker, çıplak imaj hash'ini registry adı olarak yorumladı ve derleme
durdu. Hiçbir canlı servis değişmeden yerel etiket + kesin imaj kimliği kontrolüyle
düzeltildi. API testindeki tek uyarı Starlette/AnyIO deprecated alias uyarısıdır;
çalışma bağımlılıkları bu yayın sırasında yükseltilmedi.
