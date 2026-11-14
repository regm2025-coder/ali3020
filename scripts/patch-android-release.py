"""يضيف توقيع الإصدار ورقم النسخة إلى android/app/build.gradle (يُشغَّل في CI بعد cap add android)."""
import os
import re
import sys

path = "android/app/build.gradle"
run = int(os.environ["RUN_NUMBER"])
s = open(path, encoding="utf8").read()

s, n1 = re.subn(r"versionCode\s+\d+", f"versionCode {run}", s, count=1)
s, n2 = re.subn(r'versionName\s+"[^"]*"', f'versionName "1.0.{run}"', s, count=1)

signing = "\n".join([
    "    signingConfigs {",
    "        release {",
    '            storeFile file("miad-upload.jks")',
    '            storePassword System.getenv("MIAD_STORE_PASSWORD")',
    '            keyAlias System.getenv("MIAD_KEY_ALIAS")',
    '            keyPassword System.getenv("MIAD_KEY_PASSWORD")',
    "        }",
    "    }",
    "",
])
s, n3 = re.subn(r"\n(\s*)buildTypes\s*\{", lambda m: "\n" + signing + m.group(1) + "buildTypes {", s, count=1)
s, n4 = re.subn(r"(buildTypes\s*\{\s*release\s*\{)", r"\1\n            signingConfig signingConfigs.release", s, count=1)

if not (n1 and n2 and n3 and n4):
    print("Could not patch build.gradle:", n1, n2, n3, n4)
    print(s)
    sys.exit(1)

open(path, "w", encoding="utf8").write(s)
print("Patched build.gradle, versionCode =", run)
