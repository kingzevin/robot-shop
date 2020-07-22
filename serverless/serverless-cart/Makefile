all: raw

raw: 
	./rezip.sh cart
	wsk -i action update /guest/robotshop/cart cart.zip --kind  nodejs:10 --web raw
	
