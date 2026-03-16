from pwdlib import PasswordHash

password_hash = PasswordHash.recommended()
hash = password_hash.hash("herminetincture")
print(password_hash.verify("herminetincture", hash))