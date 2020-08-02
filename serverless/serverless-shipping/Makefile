all: raw

raw:
	mvn install
	mvn package
	wsk -i action update robotshop/shipping target/shipping-1.0-jar-with-dependencies.jar --main org.steveww.spark.Main --kind java:8 --web raw