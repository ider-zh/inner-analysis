# -*- coding: utf-8 -*-
# Generated by the protocol buffer compiler.  DO NOT EDIT!
# source: text_mate.proto
# Protobuf Python Version: 4.25.0
"""Generated protocol buffer code."""
from google.protobuf import descriptor as _descriptor
from google.protobuf import descriptor_pool as _descriptor_pool
from google.protobuf import symbol_database as _symbol_database
from google.protobuf.internal import builder as _builder
# @@protoc_insertion_point(imports)

_sym_db = _symbol_database.Default()




DESCRIPTOR = _descriptor_pool.Default().AddSerializedFile(b'\n\x0ftext_mate.proto\x12\x08textMate\")\n\nCodeSource\x12\r\n\x05scope\x18\x01 \x01(\t\x12\x0c\n\x04text\x18\x02 \x01(\t\"\x18\n\x08MateData\x12\x0c\n\x04text\x18\x01 \x01(\t2O\n\x0fTextMateService\x12<\n\x10GetTextMatePlain\x12\x14.textMate.CodeSource\x1a\x12.textMate.MateDatab\x06proto3')

_globals = globals()
_builder.BuildMessageAndEnumDescriptors(DESCRIPTOR, _globals)
_builder.BuildTopDescriptorsAndMessages(DESCRIPTOR, 'text_mate_pb2', _globals)
if _descriptor._USE_C_DESCRIPTORS == False:
  DESCRIPTOR._options = None
  _globals['_CODESOURCE']._serialized_start=29
  _globals['_CODESOURCE']._serialized_end=70
  _globals['_MATEDATA']._serialized_start=72
  _globals['_MATEDATA']._serialized_end=96
  _globals['_TEXTMATESERVICE']._serialized_start=98
  _globals['_TEXTMATESERVICE']._serialized_end=177
# @@protoc_insertion_point(module_scope)
