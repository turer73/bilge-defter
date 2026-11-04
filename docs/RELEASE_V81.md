# v81 — Tanınan cihaz ve hatırlanan eşitleme parolası

Bu belge yayın prosedürüdür. Başarılı test, canlı yayın ya da fiziksel iPad kabulü kanıtı
değildir. Son adayın test, CI, stage ve canlı raporları aynı kaynak commit'i, UI manifest'i
ve source receipt ile eşleşmelidir.

## Dar kapsam

- `account-workspace.js`: onaylı canlı doğrulamadan sonra cihaz 30 gün tanınır. Doğrulanamayan
  açılışta (ağ yok, Access oturumu düşmüş, 5xx) aynı hesabın yerel defteri açılır. Sunucu işi
  yine canlı doğrulama ister.
- `sync-workspace.js`: eşitleme parolası dışa aktarılamayan bir PBKDF2 anahtarı olarak hesap
  başına IndexedDB'de hatırlanır; parola metni saklanmaz. Açılışta eşitleme kendiliğinden açılır.
- Ayrıntı, güvenlik sınırları ve silinme koşulları: `DEVICE_TRUST.md`.
- SW/cache/release/offline manifest ve paket sürümü v81 olur. Dosya kümesi v80 ile aynıdır:
  246 offline varlık. Yeni dosya, yeni nginx rotası ya da yeni PPTX varlığı yoktur.

Yayın **web-only**: yalnız `bilge-defter-invited-web` ve atomik `current` hedefi değişir. Yeni
kök `/opt/bilge-defter-classroom-v81`; geri dönüş hedefi korunmuş **gerçek v80 web**. API, hesap
servisi, kütüphane, dönüştürücü, Tailscale ve sunucu DB'leri değişmez. Cloudflare Access oturum
süresi bu sürümden önce panelden `730h` yapıldı ve paketin parçası değildir.

## Nginx

v81 nginx'i yayımlanmış v80 nginx'iyle **bayt bayt aynıdır** (`d978f355…`). Builder v80
nginx'ini sabit `6b652fc` commit'indeki şablon ve provenance ile yeniden kurar, hash
eşitliğini zorunlu tutar ve hiçbir rota eklemez. `deploy-v81.py`, aday nginx'in eski nginx'e
eşit olmadığı her durumda paketi reddeder.

## Yayımlanmış v80 geri dönüş pinleri

| Pin | Değer |
| --- | --- |
| Kaynak | 6b652fcc04e33f440cce6776a264eb00b91e00b8 |
| Kök | /opt/bilge-defter-classroom-v80 |
| UI SHA256SUMS | 34c72e2d0f89527f835d07dbac09ed046eb39bd8b6ec788e4f9cfb6c924f1481 |
| Nginx | d978f3558e986d084ab4ae89e6a2cc0c7ee816817285af22168653edbf3166f1 |
| Renderer HTML | 97579fbec1a3c9b4f475ea739cf08418e554bbb508b71ab7ca63696e5562d18f |
| v80 source receipt | 4835ce9f7ba4b391249f81175de82137fe8e7f4e37016d2bfec88f1a305313f6 |
| v80 payload | 173883ddee9c66993e03e8fadd7e43d4b5b2b04897c58348347793417fa15622 |
| Web image | sha256:a8b39bd9cf0f83869a2162827a0caf6137ddf759d50a171451b335cecc87d236 |

Kaynak dayanağı v80 yayın kanıtıdır: `outputs/direct-pptx-release-v80/` altında
`live-proof.json`, `RELEASE_EVIDENCE.md` ve `package/source-receipt.json`. Global
`minimum-reader.json` release v75 / minimum_reader v74 olarak kalır.

## Test kapıları

1. Aktif CLAIM, dal/HEAD ve dirty dosyalar doğrulanır. Eşzamanlı paketleme ya da yayın yapılmaz.
2. `npm test` son dondurulmuş adayda geçer. Bunun içinde şunlar vardır:
   - `verify-v81.cjs`: tarihsel matris, doğrudan `verify-v79` üzerine kurulu. v79 kimlikleri
     v81'e, v78 kimlikleri yayımlanmış v80'e eşlenir. v80 sarmalayıcısı üzerine kurulmaz,
     çünkü onun eşleme dizgeleri yeniden yazılırdı.
   - `tools/prepare-compat-v80.cjs`: gerçek v80 paketini `6b652fc` blob'larından yeniden kurar
     ve `34c72e2d…` manifest eşitliğini zorunlu tutar.
   - `verify-v81-check.cjs`: entegrasyon testi ve gerçek v80 okuyucusuyla geri dönüş uyumluluğu.
   - `test:device-trust`: Chromium ve WebKit, gerçek hesap API'si, sentetik Access çerezi.
   - `test:deploy-v81`: nginx eşitliği, yeni dört varlığın eksikliği, rota ekleme/çıkarma/
     genişletme ve eski geri dönüş sürümü negatifleri.
3. `verify-media-cache-pairs.cjs` sözleşmesi `v78-to-v81-metadata-only` olur. İzinli değişen
   dosyalara yalnız `account-workspace.js` eklenir; 54 raster vakası ve eşikler aynıdır.
4. Aynı SHA'nın bütün zorunlu CI işleri geçer. Eski sürümün yeşil CI'ı kabul edilmez.

## Paket, stage, aktivasyon, geri dönüş

Komutlar v80 ile aynı akıştadır, yalnız sürüm adı değişir:

```text
python -B work/build-release-v81.py
sudo python3 -B /opt/bilge-defter-classroom-v81/deploy-v81.py prepare
sudo python3 -B /opt/bilge-defter-classroom-v81/deploy-v81.py stage
# BILGE_STAGE_ORIGIN ile work/verify-stage-v81.cjs, iki motor
sudo python3 -B /opt/bilge-defter-classroom-v81/deploy-v81.py activate
sudo python3 -B /opt/bilge-defter-classroom-v81/deploy-v81.py verify
sudo python3 -B /opt/bilge-defter-classroom-v81/deploy-v81.py rollback   # gerekirse
```

`verify-stage-v81.cjs`, v80 aday varlıklarına ek olarak `account-workspace.js` ve
`sync-workspace.js` dosyalarını da zorunlu tutar. Off-host yedek, operatör kapısı ve
kör tekrar aktivasyon yasağı v80'deki gibidir. Eski `deploy-v80.py rollback` komutu
kullanılmaz ve hiçbir DB restore edilmez.

## Geri dönüş sonrası istemci durumu

v80, v81'in yazdığı `bilge-defter-trusted-device-v1` anahtarını ve `bilge-defter-device-trust`
IndexedDB'sini tanımaz, okumaz ve silmez. Geri dönüşte cihazlar v80 davranışına döner: her
açılışta canlı doğrulama ve oturum başına eşitleme parolası. Defter kayıtları
değişmez; v81 defter biçimini değiştirmez.

## Kabul sınırı

Gerçek iPad'de şu adımlar ayrıca kullanıcı kabulüdür:
- giriş yapıp uygulamayı kapatmak ve açmak,
- uçak modunda açmak,
- oturum düştükten sonra açmak,
- eşitleme parolasını bir kez girip yeniden açmak,
- iki cihazda parola değiştirmek,
- çıkış yapmak.

Masaüstü/WebKit ölçümü cihaz davranışı garantisi vermez.
