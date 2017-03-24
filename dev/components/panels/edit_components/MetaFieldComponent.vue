<template>
<component v-if="componentType" :is="componentType" :field-name="fieldName" :field-data="fieldData"></component>
</template>
<script>
import MetaFieldMixin from '../../../mixins/MetaFieldMixin.vue';
import TextComponent from './TextComponent.vue';

export default {
    mixins: [MetaFieldMixin],
    components: {
      TextComponent
    },
    computed: {
      componentType(){
        switch(this.fieldData.type){
          case "text":
            return "text-component";
          default:
            return null;
        }
      }
    }
};
</script>
