# Geri dönüş zinciri

> **2 Ekim 2026 (v70):** canlı web **v70**, hesap servisi **v68**. İlk adım
> `sudo python3 -B /opt/bilge-defter-classroom-v70/deploy-v70.py rollback` → web v69 (prova edildi:
> [RELEASE_V70](RELEASE_V70.md)). v70 anahtarlı kayıt yazmadığı için v69'a dönüş güvenlidir.

> **2 Ekim 2026 güncellemesi:** canlı web **v69**, hesap servisi **v68**. İlk adım
> `sudo python3 -B /opt/bilge-defter-classroom-v69/deploy-v69.py rollback` → web v68 (hesap servisi
> zaten v68; ön kontrollü, silinmiş konteyneri kayıttan kurar, prova edildi: [RELEASE_V69](RELEASE_V69.md)).
> Oradan sonra aşağıdaki v68 adımıyla devam edilir.

> **28 Eylül akşamı güncellemesi:** canlı web **v68**, hesap servisi **v68**. İlk adım artık
> `sudo python3 -B /opt/bilge-defter-classroom-v68/deploy-v68.py rollback` → web v67 + hesap v65
> (ikisi birlikte; ön kontrollü, silinmiş konteyneri kayıttan kurar; hesap servisi dahil prova
> edildi, [RELEASE_V68](RELEASE_V68.md)). Aşağıdaki tablo v67 ve öncesi için geçerli; oradan
> devam edilir.

28 Eylül 2026 ölçümü. İnceleme raporunun ([INCELEME_2026-09-28](INCELEME_2026-09-28.md)) B2
maddesi. Her adım kendi yayın betiğiyle yapılır. Betikler yalnız geri dönüş konteynerinin kimliğini
doğrular; **canlı sürümün beklenen sürüm olduğunu denetlemezler**, bu yüzden aşağıdaki sıraya
uyulmalı (bkz. "Bilinen kusur"). Her adımdan sonra sağlık denetimi koşturulur:

```sh
/opt/bilge-defter-monitor/bilge-defter-health.sh
```

## Şu an ne çalışıyor

| Bileşen | Sürüm | Konteyner | Dosyalar |
|---|---|---|---|
| Web (nginx) | v67 | `bilge-defter-invited-web` | `/opt/bilge-defter-classroom-v67/ui` ve `classroom-nginx.conf` |
| Hesap servisi | v65 | `bilge-defter-accounts` (imaj `bilge-defter-accounts:v65-production`) | veri `/opt/bilge-defter-classroom-v49/data`, sözlük `v57/dictionary`, sırlar `v49/secrets` |
| Kütüphane | v58 | `bilge-defter-library-v1` | kod `v58/library`, durum `/opt/bilge-defter-library-v1/state` |
| Tünel | — | `bilge-defter-invited-cloudflared` (host ağı) | belirteç `/opt/bilge-defter-invited/secrets/tunnel-token` → konteynerde `/run/secrets/tunnel-token` (28 Eylül ölçümü) |

`/opt/bilge-defter-invited/current` → `/opt/bilge-defter-classroom-v67/ui`.

## Web için zincir (yalnız web değişir, veri dokunulmaz)

| Adım | Komut | Sonuç | Ön koşul (28 Eylül'de doğrulandı) |
|---|---|---|---|
| 1 | `sudo python3 -B /opt/bilge-defter-classroom-v67/deploy-v67.py rollback` | web **v66** | durmuş `-rollback-v67` = v67 hazırlığındaki v66 konteyneri (`38ee…` eşleşiyor); konteyner silinmişse betik onu kayıtlı yapılandırmadan **yeniden kurar** |
| 2 | `sudo python3 -B /opt/bilge-defter-classroom-v66/deploy-v66.py rollback` | web **v65** | durmuş `-rollback-v66` = v65 konteyneri (`1847…` eşleşiyor); silinmişse yeniden kurar. Web v66 değilken çalıştırılmamalı; betik bunu denetlemez |
| 3 | bkz. "Hesap servisi için zincir" | web **v64** + API **v57** | web v65 iken çalışır |

Zincir burada biter: v64 hazırlığındaki v63 konteyneri 27 Eylül'de sunucu temizliğiyle silindi
(disc#1905); yerine kurulan kopya kayıtlı kimlikle eşleşmiyor ve onarım betiğinin dizini
(`/opt/bilge-defter-v64-recovery-20260927`) 28 Eylül'de kaldırıldı. v63 dosyaları duruyor ama
otomatik geri dönüşü yok. [ROLLBACK_V64_RECOVERY](ROLLBACK_V64_RECOVERY.md) belgesindeki
komutlar bu yüzden **geçersiz**; o belge tarihsel kayıt olarak kalıyor.

Her adımda betik: yeni web konteynerini durdurup `-failed-vNN` adıyla saklar, önceki konteyneri
başlatır, `current` bağını önceki `ui`'ye çevirir, o sürümün doğrulayıcısını (238 dosya hash'i,
235 çevrim dışı dosya, 14 yetkisiz istek reddi, 6 korumalı yol) canlıda koşturur. Öğrencinin
cihazındaki service worker eski sürümü bir sonraki açılışta indirir; notlar cihazda kalır.

## Hesap servisi için zincir (v65 → v57, veri korunur)

Hesap servisinin tek geri dönüş betiği `deploy-v65.py rollback`; **web'i de** v64'e düşürür ve
yalnız web v65 iken çalışır. Bu yüzden sıra:

1. Web'i v65'e indir (yukarıdaki 1 ve 2).
2. `sudo python3 -B /opt/bilge-defter-classroom-v65/deploy-v65.py rollback`
   → API `-rollback-v65` (v57 imajı, `0df7…` eşleşiyor) ve web `-rollback-v65` (v64
   dosyaları, `aa62…` eşleşiyor) başlatılır, `current` → v64.

Ön koşullar: iki durmuş `-rollback-v65` konteyneri de yerinde olmalı; v65 betiği silinmiş
konteyneri **yeniden kurmaz** (bu yetenek yalnız v66 ve v67 betiklerinde var). Veritabanı
dosyası (`v49/data/bilge-defter.sqlite`) değişmez; şema v57'den beri aynı olduğu için v57 API
aynı dosyayı okur. Veritabanının kendisini geri yüklemek ayrı işlemdir:
[YEDEK_GERI_YUKLEME](YEDEK_GERI_YUKLEME.md).

Bilinen kusur (üç betikte de var): `rollback` canlı sürümü ön kontrol etmez; yalnız durmuş geri
dönüş konteynerinin kimliğine bakar, kimlik farklı olan canlı konteyneri sürümüne bakmadan
durdurup `-failed-vNN` yapar ve `current` bağını **ancak konteyner değişiminden sonra** denetler.
Sıra dışı çalıştırılırsa (örneğin web v67 canlıyken `deploy-v66.py rollback` ya da
`deploy-v65.py rollback`) konteynerler değişmiş, bağ eski sürümde kalmış, betik "Unexpected
current link" ile durmuş olur. Bu yüzden sıraya uyulmalı ve her adımdan sonra sağlık denetimi
koşturulmalı. Sonraki yayın araçlarında (v68) `rollback` başında `current` bağının kendi `ui`
dizinini gösterdiği doğrulanmalı (`old()` benzeri ön kontrol) ve hesap servisi betiği yeniden
kurma yeteneği almalı.

## Prova durumu

- Web v67 → v66: hazırlık sırasında **prova edildi** (v66 konteyneri kayıttan 18806 portunda
  yeniden kuruldu, doğrulandı, silindi). Gerçek trafikle geçiş yapılmadı.
- Web v66 → v65: aynı prova v66 hazırlığında yapıldı.
- Hesap servisi v65 → v57: **hiç prova edilmedi.** Prova, `deploy-v65.py stage` kalıbıyla
  yapılabilir: farklı konteyner adı (`-rehearsal-`), `preview-nginx.conf` gibi upstream'i o ada
  çeviren bir nginx yapılandırması ve loopback port; ayrıca provadaki v57 konteynerinin canlı
  `/data` dosyasını paylaşmaması için ayrı bir veri kopyası gerekir. v68 hazırlığında planlanmalı.

## Geri dönüşten sonra

1. Sağlık denetimi (yukarıdaki komut) 15/15 vermeli; web sürümü `current` bağıyla aynı olmalı.
2. Öğrencilere duyuru: uygulamayı tamamen kapatıp açmaları gerekir (güncelleme bütün pencereler
   kapanınca iner).
3. Neden döndüğünü sürüm notuna yaz; başarısız konteyner `-failed-vNN` adıyla incelenmek üzere
   durur, silinmez.
4. Sunucu temizlikleri durmuş konteynerlere dokunmamalı. Klipper'ın bellek/disk düzeltmesi 27
   Eylül'den beri yalnız kullanılmayan imajları siliyor (disc#1905 kapanışı, notlar #101569 ve
   #101570; çalışan süreçte 27 Eylül'de ölçüldü).
