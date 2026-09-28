# v67 — yeni cihazda eşitleme sunucu kopyasını açar

28 Eylül 2026. İnceleme raporunun ([INCELEME_2026-09-28](INCELEME_2026-09-28.md)) A1 maddesi.

## Neden

Öğrenci yeni bir iPad'de (ya da site verisi silinmiş bir cihazda) eşitlemeyi açtığında yerel
defter tek boş sayfadan ibaret, ama makbuz olmadığı için `localDirty=true` sayılıyordu
(`sync-workspace.js` `refreshReceipt`). Sunucuda kopya varken ilk denetim **"Eşitleme
çakışması"** afişi gösteriyordu. Afişteki **"Yereldekini gönder"** boş defteri sunucuya yazıyor;
sunucu her hesap için tek kopya tuttuğundan (`bilge_defter_store.py` `ON CONFLICT DO UPDATE`)
önceki kopya geri gelmiyordu. Afişte hangi kopyanın hangi tarihte olduğu da yazmıyordu.

Bağlantılı ikinci hata: elle "Sunucuya yedekle" makbuz yazmıyordu; otomatik eşitleme açıksa
bir sonraki denetim kendi yüklediğimiz kopyayı yabancı değişiklik sanıp sahte çakışma açıyordu.

Canlıda henüz gerçek etkilenen yok: 28 Eylül itibarıyla hesap veritabanında sunucu yedeği
satırı sıfır (yalnız iki yönetici hesabı var).

## Düzeltme (yalnız web, `sync-workspace.js`)

- **El değmemiş defter sunucu kopyasını alır.** `pristineLocal()`: defter tek sayfa, sayfada
  çizgi/medya/PDF yok, defter listesi, çöp ve planlayıcı yok, makbuzda etiket ya da onaylı hash
  yok (her kayıt `sync-state-v2` satırını `dirty:true` ile yazdığı için "makbuz yok" yerine
  "hiç onaylanmamış" ölçülüyor). Bu durumda `syncTick` afiş yerine `syncApply` çalıştırır;
  önceki boş defter `before-import` kopyası olarak kalır. Eşitlemeyi açarken de durum satırı
  "Sunucudaki yedek (tarih) bu cihaza açılacak; bu pencereyi kapatın" der ve ilk denetimi
  öne çeker (diyalog açıkken hiçbir şey uygulanmaz; `editorIdle`).
- **Çakışma afişinde tarihler ve onay.** Yeni `#syncConflictDetail` satırı: "Sunucudaki kopya:
  … · Bu cihazdaki son değişiklik: …". "Yereldekini gönder" önce `confirm` ile "sunucudaki
  kopya … değiştirilecek ve geri alınamaz" diye sorar; vazgeçilirse afiş açık kalır. Afiş metni
  "daha yeni bir kopya" yerine "farklı bir kopya" diyor; yenilik iddiası tarihlere bırakıldı.
- **Elle yedekleme makbuz yazar ve eşitleme parolasını sunucu kopyasına uydurur.** Gönderim
  başarılıysa `acknowledge(expected,revision,tag,exportedAt)` çağrılır (otomatik gönderimle aynı
  sıra: önce `flushSave`, sonra `notebookJSON(state)`). Eşitleme açıkken farklı bir parolayla
  elle yedek alınmışsa sunucu kopyası artık o paroladadır; eşitleme parolası da ona geçer ve
  durum satırı bunu söyler. (v66'da eşitleme eski parolada kalıp her denetimde kopyayı
  açamıyordu.) Makbuz yazımı başarısız olursa gönderimin başarılı olduğu söylenir ve bir sonraki
  denetimde çakışma uyarısı görülebileceği eklenir; eskiden yanlış olarak "Yedek alınamadı"
  deniyordu.
- **El değmemiş uygulama kurtarma kopyası bırakmaz.** `replaceNotebook` artık
  `{preservePrevious}` alıyor; otomatik uygulamada boş defter `before-import` olarak
  saklanmıyor. Aksi halde "Önceki defteri geri getir" boş defteri geri getirip bir sonraki
  denetimde sunucuya itebilirdi. Afişten "Sunucudakini yükle" seçildiğinde kopya eskisi gibi
  saklanır.
- Değişmeyen: ink içeren ya da daha önce eşitlenmiş cihazlarda afiş eskisi gibi çıkar; sunucu,
  CAS protokolü, veri biçimi ve hesap servisi aynı. Sunucuda önceki kopyayı saklama ayrı iş
  (v68 adayı, hesap API yayını gerektirir).

## Karşıt inceleme

Yayından önce üç bağımsız okuma (veri güvenliği, test yeterliliği, yayın araçları) ve her bulgu
için ayrı bir şüpheci çalıştı: 10 ajan, 7 bulgu. Yayın araçlarında bulgu yok. Test lensi dört
kapsama boşluğu buldu (el değmemişlik sınırlarının negatif testleri yok; "çakışma yok"
iddiaları denetim hiç koşmasa da geçebiliyor; elle yedek makbuz dallarının yalnız biri
sınanıyor; bellek içi sunucu 304 üretmiyor — sonuncusu çürütüldü, 304 yolu
`verify-reliability.cjs`'te). Veri lensi üç kusur buldu (farklı parolayla elle yedek, makbuz
hatasında yanlış mesaj, boş defterin kurtarma kopyası). Üçü de doğrulandı ve yukarıda düzeltildi;
test boşlukları için paket 12'den 18 kontrole çıkarıldı.

## Yerel doğrulama

- **`verify-v67-sync.cjs` (yeni), 18 kontrol, Chromium ve WebKit; bellek içi CAS sunucusu:**
  - hiç yazılmamış cihaz sunucu defterini afişsiz ve gönderimsiz açıyor; sonraki çizgiler
    normal gönderiliyor;
  - mürekkepli cihaz afişte duruyor, afiş iki tarihi gösteriyor;
  - "Yereldekini gönder" reddedilince hiçbir şey yapmıyor, onaylanınca sunucu kopyasını
    değiştiriyor;
  - elle yedekleme makbuz yazıyor; sonraki denetimler gerçekten çalışıyor (GET sayısı artıyor)
    ve ne yeniden gönderiyor ne çakışma açıyor; farklı parolayla elle yedek makbuza dokunmuyor;
    eşitleme kapalıyken alınan elle yedek, eşitleme açılınca eşitlenmiş sayılıyor;
  - el değmemişlik sınırları: tek boş sayfalı defterde defter listesi, çöp kaydı ya da önceki
    eşitleme makbuzu varsa afiş eskisi gibi çıkıyor (PDF zeminli tek sayfa kurulmadı, kodda
    `only.pdf===undefined` koşuluyla kapsanıyor);
  - sunucuda kopya yokken yeni cihazın ilk gönderimi eskisi gibi oluyor.
- **Negatif kontrol.** Aynı paket v66'ya karşı ilk senaryoda "hiç yazılmamış cihaz çakışma
  görmemeli" iddiasında kalıyor.
- **`test_deploy_v67.py`** (v66 testleri v67 betiğine karşı): 4 kontrol.
- Fiziksel iPad ve gerçek hesap testi yapılmadı.

## Regresyon

- `npm test` (`verify-v67.cjs`): **21 paket** Chromium ve WebKit'te geçti, ardından
  `verify-reliability.cjs` 26 kontrol geçti; çıkış kodu 0. v66 temel paketi Git'ten sabit hash'le
  (`d05c863` → `fe5f5948…`) yeniden üretildi.
- v66 → v67 gerçek service-worker güncellemesi ve notların korunması iki motorda geçti
  (`verify-v59-update`, `verify-v47-update`).
- Oynak `verify-v61-save` WebKit PDF ölçümü bu koşuda geçti (önbellekli 30 ms, tam 63 ms); eşik
  değiştirilmedi.
- Not: `npm test` Git Bash'ten çalışmaz (GNU `tar`, `D:` yolunu uzak sunucu sanıyor); PowerShell
  ya da cmd'den çalıştırılmalı.

## Yayın

Kullanıcı onayıyla ("Evet, canlıya al") 28 Eylül 2026 sabahı canlıya alındı. Künye:

| Alan | Değer |
|---|---|
| Kaynak commit | `4953adba538e131527bd9fa0e124397ea23fdc6e` |
| Paket `SHA256SUMS` | `bdc4b8eb…` |
| Payload | `9a940160…`, 246 dosya |
| nginx yapılandırması | `3f3ef2ae…`, v66 ile aynı |

**Yayın betiğinin kontrolleri:** `stage` (127.0.0.1:18800) ve `activate` (canlı) aynı dört
kontrolü geçti: 238 HTTP hash, 235 çevrim dışı dosya, 14 yetkisiz istek reddi, 6 korumalı yol
kapalı. `rehearse`: v66 web konteyneri kayıtlı yapılandırmadan 18806'da yeniden kuruldu, v66
doğrulayıcısından geçti, silindi. Kütüphane sağlıklı; hesap servisi (v65) aynı kimlikte.

**Yayın kapısı bir kez durdu.** İlk `activate`, korunan çalışma zamanı anlık görüntüsünde fark
görüp hiçbir şeye dokunmadan çıktı ("Unrelated runtime changed"). Fark ölçüldü: 35 konteynerin
hepsi aynıydı; yalnız linux-ai-server'ın ana işlem numarası değişmişti (klipper oturumu
09:43:54'te servisi başka bir iş için yeniden başlatmıştı, `sudo systemctl restart`
günlükte). Web yayınıyla ilgisi olmadığı için `private/protected.json` yalnız `main_pid`
alanında güncellendi (eski dosya `protected.json.before-pid-refresh` olarak duruyor) ve
`activate` yeniden koşuldu. Ders: hazırlıkla kesim arasında başka oturumlar servis yeniden
başlatırsa kapı durur; kapıyı geçmeden önce fark her seferinde ölçülmeli.

**Bağımsız kontroller:** `current` → `/opt/bilge-defter-classroom-v67/ui`; `release.json`
v67; canlıdaki `sync-workspace.js`, `index.html`, `sw.js`, `release.json`, `save-worker.js`
baytları Git'teki `4953adb` ile aynı; v66 web konteyneri `-rollback-v67` adıyla durdurulmuş;
internetten oturumsuz istek 302 ile Access girişine gidiyor.

**Henüz yapılmadı:** fiziksel iPad ve gerçek hesapla kabul; GitHub'a push ve `master`
birleştirmesi (ayrı istek); sunucuda önceki kopyayı saklama (v68, hesap API yayını).

Geri dönüş (yalnız v67 etkin sürümken; durmuş v66 konteyneri silinmiş olsa bile onu kayıtlı
yapılandırmadan yeniden kurar):

```sh
sudo python3 -B /opt/bilge-defter-classroom-v67/deploy-v67.py rollback
```
