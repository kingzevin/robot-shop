all: raw

raw: 
	./rezip.sh catalogue
	wsk -i action update /guest/robotshop/catalogue catalogue.zip --kind  nodejs:10 --web raw
	
