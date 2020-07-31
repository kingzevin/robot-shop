all: deploy

env:
	docker run --rm -v "$PWD:/tmp" openwhisk/python3action bash \
  -c "cd tmp && virtualenv virtualenv && source virtualenv/bin/activate && pip install -r requirements.txt"

deploy:
	zip -r payment.zip  virtualenv __main__.py 
	wsk -i action update robotshop/payment payment.zip --web raw --kind python:3