from skyfield.api import load, wgs84
from skyfield.timelib import Time
import numpy as np

# Muat data efemeris
ts = load.timescale()
eph = load('de421.bsp')  # Atau de440.bsp untuk presisi lebih tinggi
earth = eph['earth']
moon = eph['moon']
sun = eph['sun']

# Tentukan lokasi pengamat (Jakarta)
jakarta = wgs84.latlon(-6.2088, 106.8456, elevation_m=8)

def is_lunar_eclipse(t,tol):
    """Memeriksa apakah terjadi gerhana bulan dari Jakarta."""

    # Posisi Bulan dan Matahari relatif terhadap pengamat di Jakarta
    observer = earth + jakarta
    moon_pos = observer.at(t).observe(moon)
    sun_pos = observer.at(t).observe(sun)

    # Koordinat ekliptika untuk Bulan dan Matahari
    moon_ec = moon_pos.ecliptic_latlon()
    sun_ec = sun_pos.ecliptic_latlon()

    # Perbedaan bujur ekliptika (harus dekat 180 untuk oposisi)
    delta_lon = abs((moon_ec[1].degrees - sun_ec[1].degrees) % 360)
    delta_lon = min(delta_lon, 360 - delta_lon) # Memastikan selisih kurang dari 180

    # Cek oposisi (toleransi 5 derajat, bisa disesuaikan)
    if abs(delta_lon - 180) > tol:
        return False, None

    # Cek lintang ekliptika Bulan (harus dekat 0 untuk gerhana)
    if abs(moon_ec[0].degrees) > tol:  # Toleransi 1 derajat
        return False, None
    
    return True, t

# Rentang waktu yang akan diperiksa
t0 = ts.utc(2025, 1, 1)
t1 = ts.utc(2026, 1, 1)
t = ts.linspace(t0, t1, 5000)  # Resolusi yang cukup

# Cari gerhana
eclipse_times = []
for ti in t:
    is_eclipse, eclipse_time = is_lunar_eclipse(ti,0.75)
    if is_eclipse:
        eclipse_times.append(eclipse_time)

if eclipse_times:
    print("Potensi Gerhana Bulan yang terlihat dari Jakarta antara 2025 dan 2026:")
    print(f"Lokasi: Jakarta (-6.2088°S, 106.8456°E)")
    for et in eclipse_times:
        # Cek visibilitas dari Jakarta
        observer = earth + jakarta
        moon_pos = observer.at(et).observe(moon)
        alt, az, d = moon_pos.apparent().altaz()
        
        visibilitas = "terlihat" if alt.degrees > 0 else "di bawah horizon"
        print(f"\n*****\n{et.utc_strftime('%Y-%m-%d %H:%M UTC')} ({visibilitas}, altitude: {alt})")

        # Contoh detail untuk satu gerhana (jika ada)
        t = et
        observer = earth + jakarta
        moon_pos = observer.at(t).observe(moon)
        ra, dec, distance = moon_pos.radec()
        ecliptic = moon_pos.ecliptic_latlon()
        alt, az, d = moon_pos.apparent().altaz()
        
        print(f"Waktu: {t.utc_strftime('%Y-%m-%d %H:%M UTC')}")
        # print(f"Altitude: {alt}")
        # print(f"Azimuth: {az}")
        # print(f"RA: {ra}")
        # print(f"Dec: {dec}")
        # print(f"Jarak: {distance}")
        # print(f"Lintang Ecliptika: {ecliptic[0]}")
        # print(f"Bujur Ecliptika: {ecliptic[1]}")
else:
    print("Tidak ada gerhana bulan terdeteksi dalam rentang waktu tersebut.")