"""يجهّز مشروع أندرويد لإشعارات FCM بعد cap add/sync:
نسخ google-services.json، التأكد من مكوّن google-services في Gradle، وإذن POST_NOTIFICATIONS."""
import os
import re
import shutil
import sys

SRC = "android-config/google-services.json"
if not os.path.isfile(SRC):
    print("Missing", SRC)
    sys.exit(1)
shutil.copy(SRC, "android/app/google-services.json")

# 1) مكوّن google-services في الجذر
root_path = "android/build.gradle"
root = open(root_path, encoding="utf8").read()
if "com.google.gms:google-services" not in root:
    root, n = re.subn(
        r"(dependencies\s*\{)",
        r"\1\n        classpath 'com.google.gms:google-services:4.4.2'",
        root,
        count=1,
    )
    if not n:
        print("Could not add google-services classpath")
        sys.exit(1)
    open(root_path, "w", encoding="utf8").write(root)
    print("Added google-services classpath")

# 2) تطبيق المكوّن في التطبيق
app_path = "android/app/build.gradle"
app = open(app_path, encoding="utf8").read()
if "com.google.gms.google-services" not in app:
    app += "\napply plugin: 'com.google.gms.google-services'\n"
    open(app_path, "w", encoding="utf8").write(app)
    print("Applied google-services plugin")

# 3) إذن الإشعارات (أندرويد 13+)
man_path = "android/app/src/main/AndroidManifest.xml"
man = open(man_path, encoding="utf8").read()
if "android.permission.POST_NOTIFICATIONS" not in man:
    man, n = re.subn(
        r"(<application)",
        '<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />\n    \\1',
        man,
        count=1,
    )
    if not n:
        print("Could not add POST_NOTIFICATIONS")
        sys.exit(1)
    open(man_path, "w", encoding="utf8").write(man)
    print("Added POST_NOTIFICATIONS")

print("Android push prepared")
