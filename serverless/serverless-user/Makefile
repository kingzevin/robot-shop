all: raw

raw: 
	./rezip.sh user
	wsk -i action update /guest/robotshop/user user.zip --kind  nodejs:10 --web raw
	
