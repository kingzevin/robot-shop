#!/bin/bash

rm -rf *.zip 
zip -r ${1}.zip * &> /dev/null
