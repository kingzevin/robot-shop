OW_USER?=openwhisk
OW_RUNTIME?=$(OW_USER)/actionloop-base
OW_COMPILER?=$(OW_USER)/action-golang-v1.11
WSK?=wsk -i
MAIN=main
PACKAGE=/guest/robotshop
SRCS=src/main/main.go
NAME=dispatch
BINZIP=$(MAIN)-bin.zip

deploy: package.done $(BINZIP)
	$(WSK) action update $(PACKAGE)/$(NAME) $(BINZIP) --main $(MAIN) --docker $(OW_RUNTIME)

raw: package.done $(BINZIP)
	$(WSK) action update $(PACKAGE)/$(NAME) $(BINZIP) --main $(MAIN) --docker $(OW_RUNTIME) --web raw

true: package.done $(BINZIP)
	$(WSK) action update $(PACKAGE)/$(NAME) $(BINZIP) --main $(MAIN) --docker $(OW_RUNTIME) --web true

$(BINZIP): $(SRCS)
	cd src ; zip - -qr * | docker run -i $(OW_COMPILER) -compile $(MAIN) >../$(BINZIP)

clean:
	-$(WSK) action delete $(PACKAGE)/$(NAME)
	-rm $(BINZIP) $(SRCZIP) package.done test.json 2>/dev/null

package.done:
	$(WSK) package update $(PACKAGE)
	touch package.done

.PHONY: deploy devel test clean